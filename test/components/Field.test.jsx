import {describe, it, expect, vi} from 'vitest';
import {render, screen, act, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import Form from '../../src/components/Form';
import {useFormContext} from '../../src/context';
import {
  Field,
  Checkbox,
  Select,
  fieldErrorId
} from '../../src/components/Field';
import createForm, {
  getErrors,
  getValue,
  getValues,
  setError,
  setFocus,
  setDisabled,
  handleSubmit,
  reset,
  setInitialValues,
  trigger
} from '../../src/form';

describe('Field', () => {
  it('renders an input with value', () => {
    render(
      <Form initialValues={{name: 'test'}}>
        <Field name="name" />
      </Form>
    );
    const input = screen.getByDisplayValue('test');
    expect(input).toBeDefined();
  });

  it('updates value on change', async () => {
    const user = userEvent.setup();
    render(
      <Form initialValues={{name: ''}}>
        <Field name="name" data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    await user.type(input, 'hello');
    expect(input.value).toBe('hello');
  });

  it('renders with custom component via as prop', () => {
    function CustomInput({value, onChange, ...props}) {
      return (
        <textarea
          {...props}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      );
    }
    render(
      <Form initialValues={{bio: 'hello'}}>
        <Field name="bio" as={CustomInput} />
      </Form>
    );
    expect(screen.getByDisplayValue('hello')).toBeDefined();
  });

  it('does not store an error when built-in validation fails', async () => {
    const form = createForm({initialValues: {name: ''}, mode: 'onBlur'});
    const validate = vi.fn(() => 'custom error');
    const user = userEvent.setup();

    render(
      <Form form={form}>
        <Field
          name="name"
          required
          validate={validate}
          data-testid="name-input"
        />
      </Form>
    );
    const input = screen.getByTestId('name-input');

    await user.click(input);
    await user.tab();
    expect(validate).not.toHaveBeenCalled();
    expect(getErrors(form)).toEqual([]);

    await user.type(input, 'filled');
    await user.tab();
    expect(validate).toHaveBeenCalled();
    expect(getErrors(form)).toEqual([
      {path: 'name', type: 'custom', message: 'custom error'}
    ]);
  });

  it('attaches aria-invalid and aria-describedby pointing at the rendered error', async () => {
    const form = createForm({initialValues: {name: ''}, mode: 'onBlur'});
    const user = userEvent.setup();
    render(
      <Form form={form}>
        <Field
          name="name"
          validate={() => 'too short'}
          renderError={error => error}
          data-testid="name-input"
        />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();

    // Trigger blur validation to produce an error
    await user.click(input);
    await user.tab();
    await vi.waitFor(() => {
      expect(input.getAttribute('aria-invalid')).toBe('true');
    });
    const describedById = input.getAttribute('aria-describedby');
    expect(describedById).toBe('name');
    const errorEl = document.getElementById(describedById);
    expect(errorEl).not.toBeNull();
    expect(errorEl.getAttribute('role')).toBe('alert');
    expect(errorEl.textContent).toBe('too short');
  });

  it('generates the error id from the field path key', async () => {
    const form = createForm({initialValues: {}});
    render(
      <Form form={form}>
        <Field name={['a', 0]} renderError={error => error} data-testid="a0" />
      </Form>
    );
    await act(async () => {
      setError(form, ['a', 0], 'oops');
    });
    const input = screen.getByTestId('a0');
    await vi.waitFor(() => {
      expect(input.getAttribute('aria-invalid')).toBe('true');
    });
    expect(input.getAttribute('aria-describedby')).toBe('a-0');
    expect(document.getElementById('a-0').textContent).toBe('oops');
  });

  it('does not attach aria attributes without an error', () => {
    render(
      <Form initialValues={{name: 'ok'}}>
        <Field
          name="name"
          renderError={error => error}
          data-testid="name-input"
        />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('reflects the validating flag as aria-busy on the input', async () => {
    vi.useFakeTimers();
    try {
      let resolveValidation;
      const form = createForm({initialValues: {name: ''}, mode: 'all'});
      render(
        <Form form={form}>
          <Field
            name="name"
            data-testid="name-input"
            validateDebounce={30}
            validate={value =>
              new Promise(resolve => {
                resolveValidation = () =>
                  resolve(value ? undefined : 'required');
              })
            }
          />
        </Form>
      );
      const input = screen.getByTestId('name-input');
      expect(input.getAttribute('aria-busy')).toBeNull();

      // The keystroke opens the debounce window: validating holds through
      // the pending window and the in-flight async round.
      act(() => {
        fireEvent.change(input, {target: {value: 'a'}});
      });
      expect(input.getAttribute('aria-busy')).toBe('true');

      act(() => {
        vi.advanceTimersByTime(30);
      });
      expect(input.getAttribute('aria-busy')).toBe('true');

      await act(async () => {
        resolveValidation();
      });
      expect(input.getAttribute('aria-busy')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('describes fieldErrorId(name) even without renderError', async () => {
    // Library-level wiring convention: a field with an error always sets
    // aria-invalid and describes the fieldErrorId(name) element, so a
    // custom error component only needs to render that id.
    const form = createForm({initialValues: {name: ''}});
    render(
      <Form form={form}>
        <Field name="name" data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    expect(input.getAttribute('aria-describedby')).toBeNull();
    await act(async () => {
      setError(form, 'name', 'oops');
    });
    await vi.waitFor(() => {
      expect(input.getAttribute('aria-invalid')).toBe('true');
    });
    expect(input.getAttribute('aria-describedby')).toBe('name');
    // Headless still renders no extra element of its own
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('fieldErrorId derives the same id from the field name', async () => {
    expect(fieldErrorId('name')).toBe('name');
    expect(fieldErrorId(['a', 0, 'b c'])).toBe('a-0-b-c');
    const form = createForm({initialValues: {name: ''}});
    render(
      <Form form={form}>
        <Field name="name" data-testid="name-input" />
      </Form>
    );
    await act(async () => {
      setError(form, 'name', 'oops');
    });
    await vi.waitFor(() => {
      expect(
        screen.getByTestId('name-input').getAttribute('aria-describedby')
      ).toBe(fieldErrorId('name'));
    });
  });

  it('appends the error id after a user-provided aria-describedby', async () => {
    const form = createForm({initialValues: {name: ''}});
    render(
      <Form form={form}>
        <Field name="name" aria-describedby="hint" data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    expect(input.getAttribute('aria-describedby')).toBe('hint');
    await act(async () => {
      setError(form, 'name', 'oops');
    });
    await vi.waitFor(() => {
      expect(input.getAttribute('aria-invalid')).toBe('true');
    });
    expect(input.getAttribute('aria-describedby')).toBe('hint name');
  });

  it('does not override a user-provided aria-label', async () => {
    const form = createForm({initialValues: {name: ''}});
    render(
      <Form form={form}>
        <Field
          name="name"
          aria-label="X"
          renderError={error => error}
          data-testid="name-input"
        />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    expect(input.getAttribute('aria-label')).toBe('X');
    await act(async () => {
      setError(form, 'name', 'oops');
    });
    await vi.waitFor(() => {
      expect(input.getAttribute('aria-invalid')).toBe('true');
    });
    expect(input.getAttribute('aria-label')).toBe('X');
  });

  it('uses a user-provided id instead of a generated one', async () => {
    const form = createForm({initialValues: {name: ''}});
    render(
      <Form form={form}>
        <Field
          name="name"
          id="my"
          renderError={error => error}
          data-testid="name-input"
        />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    expect(input.id).toBe('my');
    await act(async () => {
      setError(form, 'name', 'oops');
    });
    await vi.waitFor(() => {
      expect(input.getAttribute('aria-invalid')).toBe('true');
    });
    // The input keeps the user id; the error element keeps the generated one
    // so the two never collide.
    expect(input.id).toBe('my');
    expect(document.getElementById('my')).toBe(input);
    expect(input.getAttribute('aria-describedby')).toBe('name');
  });

  it('attaches aria-invalid on Checkbox when it has an error', async () => {
    const form = createForm({initialValues: {terms: false}});
    render(
      <Form form={form}>
        <Checkbox name="terms" data-testid="terms" />
      </Form>
    );
    const checkbox = screen.getByTestId('terms');
    expect(checkbox.getAttribute('aria-invalid')).toBeNull();
    expect(checkbox.getAttribute('aria-describedby')).toBeNull();
    await act(async () => {
      setError(form, 'terms', 'must accept');
    });
    await vi.waitFor(() => {
      expect(checkbox.getAttribute('aria-invalid')).toBe('true');
    });
    // Same error-id convention as Field
    expect(checkbox.getAttribute('aria-describedby')).toBe('terms');
  });

  it('attaches aria-invalid and describes fieldErrorId on Select when it has an error', async () => {
    const form = createForm({initialValues: {color: ''}});
    render(
      <Form form={form}>
        <Select name="color" data-testid="color">
          <option value="">pick</option>
          <option value="red">red</option>
        </Select>
      </Form>
    );
    const select = screen.getByTestId('color');
    expect(select.getAttribute('aria-invalid')).toBeNull();
    await act(async () => {
      setError(form, 'color', 'pick one');
    });
    await vi.waitFor(() => {
      expect(select.getAttribute('aria-invalid')).toBe('true');
    });
    expect(select.getAttribute('aria-describedby')).toBe(fieldErrorId('color'));
  });

  it('focuses the input when setFocus names the field', () => {
    const form = createForm({initialValues: {name: 'a', email: 'b'}});
    render(
      <Form form={form}>
        <Field name="name" data-testid="name-input" />
        <Field name="email" data-testid="email-input" />
      </Form>
    );
    const nameInput = screen.getByTestId('name-input');
    const emailInput = screen.getByTestId('email-input');

    act(() => {
      setFocus(form, 'name');
    });

    expect(document.activeElement).toBe(nameInput);
    expect(document.activeElement).not.toBe(emailInput);
  });

  it('selects the whole value when setFocus passes shouldSelect', () => {
    const form = createForm({initialValues: {name: 'hello'}});
    render(
      <Form form={form}>
        <Field name="name" data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');

    act(() => {
      setFocus(form, 'name', {shouldSelect: true});
    });

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(input.value).toBe('hello');
  });

  it('focuses without selecting when setFocus omits shouldSelect', () => {
    const form = createForm({initialValues: {name: 'hello'}});
    render(
      <Form form={form}>
        <Field name="name" data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');

    act(() => {
      setFocus(form, 'name');
    });

    expect(document.activeElement).toBe(input);
    // Plain focus collapses the caret (jsdom parks it at the end) instead
    // of selecting the value.
    expect(input.selectionStart).toBe(input.selectionEnd);
  });

  it('does not throw when setFocus names a field that is not mounted', () => {
    const form = createForm({initialValues: {name: ''}});
    render(
      <Form form={form}>
        <Field name="name" data-testid="name-input" />
      </Form>
    );

    expect(() => {
      act(() => {
        setFocus(form, 'missing');
      });
    }).not.toThrow();
    expect(screen.getByTestId('name-input')).toBeDefined();
  });

  it('keeps failed-submit auto-focus working without selecting', async () => {
    const form = createForm({
      initialValues: {name: 'abc'},
      validate: values => (values.name.length >= 8 ? {} : {name: 'too short'})
    });
    render(
      <Form form={form}>
        <Field name="name" data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');

    await act(async () => {
      await handleSubmit(form)();
    });

    // handleSubmit's own focusError emit only focuses — the caret stays
    // collapsed instead of selecting the value, exactly as before setFocus
    // extended the channel.
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(input.selectionEnd);
  });

  it('stores rule failures in form state and keeps rules off the DOM', async () => {
    const form = createForm({initialValues: {age: ''}, mode: 'onBlur'});
    const user = userEvent.setup();

    render(
      <Form form={form}>
        <Field
          name="age"
          rules={{required: 'Age is required', min: 18}}
          data-testid="age-input"
        />
      </Form>
    );
    const input = screen.getByTestId('age-input');

    // rules is an option, not a DOM attribute.
    expect(input.hasAttribute('rules')).toBe(false);

    // Blurring empty reports only the required error in state (not a
    // browser-only bubble), with the given message.
    await user.click(input);
    await user.tab();
    expect(getErrors(form)).toEqual([
      {path: 'age', type: 'required', message: 'Age is required'}
    ]);

    // Typing re-validates (reValidateMode) and switches to the min error.
    await user.type(input, '10');
    expect(getErrors(form)).toEqual([
      {path: 'age', type: 'min', message: 'Must be at least 18'}
    ]);
  });

  it('renders every input disabled from a form-level disabled flag', () => {
    const form = createForm({
      initialValues: {name: '', email: ''},
      disabled: true
    });
    render(
      <Form form={form}>
        <Field name="name" data-testid="name-input" />
        <Field name="email" data-testid="email-input" />
      </Form>
    );
    expect(screen.getByTestId('name-input').disabled).toBe(true);
    expect(screen.getByTestId('email-input').disabled).toBe(true);
  });

  it('re-renders inputs when setDisabled toggles', () => {
    const form = createForm({initialValues: {name: ''}});
    render(
      <Form form={form}>
        <Field name="name" data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    expect(input.disabled).toBe(false);

    act(() => setDisabled(form, true));
    expect(input.disabled).toBe(true);

    act(() => setDisabled(form, false));
    expect(input.disabled).toBe(false);
  });

  it('disables a single field through the disabled prop', () => {
    const form = createForm({initialValues: {a: '', b: ''}});
    render(
      <Form form={form}>
        <Field name="a" disabled data-testid="a-input" />
        <Field name="b" data-testid="b-input" />
      </Form>
    );
    expect(screen.getByTestId('a-input').disabled).toBe(true);
    expect(screen.getByTestId('b-input').disabled).toBe(false);
  });

  it('a disabled form wins over a field disabled={false}', () => {
    const form = createForm({initialValues: {a: ''}, disabled: true});
    render(
      <Form form={form}>
        <Field name="a" disabled={false} data-testid="a-input" />
      </Form>
    );
    // OR semantics: the field cannot opt out of a disabled form.
    expect(screen.getByTestId('a-input').disabled).toBe(true);
  });

  it('applies the merged disabled flag on Checkbox and Select', () => {
    const form = createForm({initialValues: {terms: false, color: 'red'}});
    render(
      <Form form={form}>
        <Checkbox name="terms" data-testid="terms" />
        <Select name="color" data-testid="color">
          <option value="red">Red</option>
          <option value="blue">Blue</option>
        </Select>
      </Form>
    );
    expect(screen.getByTestId('terms').disabled).toBe(false);
    expect(screen.getByTestId('color').disabled).toBe(false);

    act(() => setDisabled(form, true));
    expect(screen.getByTestId('terms').disabled).toBe(true);
    expect(screen.getByTestId('color').disabled).toBe(true);
  });

  it('delays the rendered error by delayError while state stays immediate', () => {
    vi.useFakeTimers();
    try {
      const form = createForm({initialValues: {name: ''}, mode: 'onBlur'});
      render(
        <Form form={form}>
          <Field
            name="name"
            validate={() => 'oops'}
            delayError={100}
            renderError={error => error}
            data-testid="name-input"
          />
        </Form>
      );
      const input = screen.getByTestId('name-input');

      fireEvent.blur(input);
      // State carries the error at once; the DOM does not yet.
      expect(getErrors(form)).toEqual([
        {path: 'name', type: 'custom', message: 'oops'}
      ]);
      expect(input.getAttribute('aria-invalid')).toBeNull();
      expect(document.querySelector('[role="alert"]')).toBeNull();

      act(() => vi.advanceTimersByTime(100));
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(document.querySelector('[role="alert"]').textContent).toBe('oops');
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls function refs and fills object refs with the input node', () => {
    const calls = [];
    const objectRef = React.createRef();
    render(
      <Form initialValues={{a: '', b: ''}}>
        <Field
          name="a"
          ref={node => {
            calls.push(node);
          }}
        />
        <Field name="b" ref={objectRef} />
      </Form>
    );
    expect(calls[0]).toBeInstanceOf(HTMLInputElement);
    expect(objectRef.current).toBeInstanceOf(HTMLInputElement);
  });

  it('does not focus a field when focusError names another field', () => {
    const form = createForm({initialValues: {name: 'a', email: 'b'}});
    render(
      <Form form={form}>
        <Field name="name" data-testid="name" />
        <Field name="email" data-testid="email" />
      </Form>
    );

    act(() => setFocus(form, 'email'));
    expect(document.activeElement).toBe(screen.getByTestId('email'));
    expect(document.activeElement).not.toBe(screen.getByTestId('name'));
  });

  it('spreads valueToProps over the element instead of the value prop', () => {
    function Custom({selected}) {
      return <output data-testid="out">{selected}</output>;
    }
    render(
      <Form initialValues={{pick: 'yes'}}>
        <Field name="pick" as={Custom} valueToProps={v => ({selected: v})} />
      </Form>
    );
    expect(screen.getByTestId('out').textContent).toBe('yes');
  });

  it('describes the Checkbox error element while keeping user hints', async () => {
    const form = createForm({initialValues: {terms: false}});
    render(
      <Form form={form}>
        <Checkbox name="terms" aria-describedby="terms-hint" />
      </Form>
    );
    const box = screen.getByRole('checkbox');
    expect(box.getAttribute('aria-describedby')).toBe('terms-hint');

    act(() => setError(form, 'terms', 'must accept'));
    expect(box.getAttribute('aria-invalid')).toBe('true');
    // User-provided ids stay ahead of the generated error id.
    expect(box.getAttribute('aria-describedby')).toBe('terms-hint terms');
  });
});

describe('Field type="file"', () => {
  it('never binds a value prop and stores picked files in the form', () => {
    const form = createForm({initialValues: {avatar: undefined}});
    render(
      <Form form={form}>
        <Field type="file" name="avatar" />
      </Form>
    );
    const input = document.querySelector('input[type="file"]');
    expect(input.hasAttribute('value')).toBe(false);

    const files = [new File(['hello'], 'a.txt', {type: 'text/plain'})];
    fireEvent.change(input, {target: {files}});
    expect(getValue(form, 'avatar')).toBe(files);
    // No controlled-file warning path: the element stays value-free.
    expect(input.hasAttribute('value')).toBe(false);
  });

  it('passes picked files through getValues for submission', () => {
    const form = createForm({initialValues: {avatar: undefined, note: 'x'}});
    render(
      <Form form={form}>
        <Field type="file" name="avatar" />
        <Field name="note" />
      </Form>
    );
    const input = document.querySelector('input[type="file"]');
    const files = [
      new File(['data'], 'b.bin', {type: 'application/octet-stream'})
    ];
    fireEvent.change(input, {target: {files}});
    const values = getValues(form);
    expect(values.note).toBe('x');
    // DEV snapshots clone containers, so compare structure — the File
    // instances themselves pass through by reference (non-plain values).
    expect(values.avatar).toEqual(files);
    expect(values.avatar[0]).toBe(files[0]);
  });
});

describe('Field uncontrolled', () => {
  it('skips re-rendering the field on its own changes but keeps the store current', () => {
    let renders = 0;
    const CountingInput = React.forwardRef((props, ref) => {
      renders++;
      return <input {...props} ref={ref} />;
    });
    const form = createForm({initialValues: {u: 'init'}});
    render(
      <Form form={form}>
        <Field name="u" uncontrolled as={CountingInput} />
      </Form>
    );
    const input = screen.getByDisplayValue('init');
    expect(renders).toBe(1);

    fireEvent.change(input, {target: {value: 'typed'}});
    expect(getValue(form, 'u')).toBe('typed');
    // Store write only: the field body never re-rendered.
    expect(renders).toBe(1);
    // The DOM element keeps its own text (uncontrolled semantics).
    expect(input.value).toBe('typed');
  });

  it('leaves the DOM value to the element while a controlled twin re-applies transforms', () => {
    const form = createForm({initialValues: {u: 'init', c: 'init'}});
    const up = e => e.target.value.toUpperCase();
    render(
      <Form form={form}>
        <Field name="u" uncontrolled eventToValue={up} />
        <Field name="c" eventToValue={up} />
      </Form>
    );
    const [uInput, cInput] = screen.getAllByDisplayValue('init');
    fireEvent.change(uInput, {target: {value: 'abc'}});
    fireEvent.change(cInput, {target: {value: 'abc'}});
    expect(getValue(form, 'u')).toBe('ABC');
    expect(getValue(form, 'c')).toBe('ABC');
    // Controlled re-render pushes the transformed value back into the DOM;
    // the uncontrolled element keeps what the user typed.
    expect(uInput.value).toBe('abc');
    expect(cInput.value).toBe('ABC');
  });

  it('still re-renders on error state, like register', () => {
    let renders = 0;
    const CountingInput = React.forwardRef((props, ref) => {
      renders++;
      return <input {...props} ref={ref} />;
    });
    const form = createForm({initialValues: {u: 'init'}});
    render(
      <Form form={form}>
        <Field name="u" uncontrolled as={CountingInput} />
      </Form>
    );
    expect(renders).toBe(1);
    act(() => setError(form, 'u', 'oops'));
    expect(renders).toBe(2);
    expect(screen.getByDisplayValue('init').getAttribute('aria-invalid')).toBe(
      'true'
    );
  });
});

describe('Field valueAsNumber / valueAsDate', () => {
  it('valueAsNumber stores e.target.valueAsNumber (a number)', () => {
    const form = createForm({initialValues: {age: 0}});
    render(
      <Form form={form}>
        <Field name="age" type="number" valueAsNumber />
      </Form>
    );
    const input = screen.getByDisplayValue('0');
    // jsdom derives valueAsNumber from the element's value — only value
    // is injected into the target (assigning valueAsNumber directly
    // throws InvalidStateError on unsupported input types).
    fireEvent.change(input, {target: {value: '42'}});
    expect(getValue(form, 'age')).toBe(42);
  });

  it('valueAsDate stores e.target.valueAsDate (a Date)', () => {
    const form = createForm({initialValues: {day: undefined}});
    render(
      <Form form={form}>
        <Field name="day" type="date" valueAsDate />
      </Form>
    );
    const input = document.querySelector('input[type="date"]');
    fireEvent.change(input, {target: {value: '2026-09-08'}});
    expect(getValue(form, 'day')).toEqual(new Date('2026-09-08'));
  });

  it('an explicit eventToValue takes precedence over valueAsNumber', () => {
    const form = createForm({initialValues: {n: 0}});
    render(
      <Form form={form}>
        <Field name="n" valueAsNumber eventToValue={e => e.target.value} />
      </Form>
    );
    fireEvent.change(screen.getByDisplayValue('0'), {target: {value: '7'}});
    expect(getValue(form, 'n')).toBe('7');
  });

  it('valueAsNumber and valueAsDate together warn in DEV and number wins', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const form = createForm({initialValues: {x: 0}});
      render(
        <Form form={form}>
          <Field name="x" type="number" valueAsNumber valueAsDate />
        </Form>
      );
      fireEvent.change(screen.getByDisplayValue('0'), {target: {value: '5'}});
      expect(getValue(form, 'x')).toBe(5);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('mutually exclusive')
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('never spreads the conversion props onto the DOM element', () => {
    const form = createForm({initialValues: {age: 0}});
    render(
      <Form form={form}>
        <Field name="age" type="number" valueAsNumber />
      </Form>
    );
    const input = screen.getByDisplayValue('0');
    expect(input.hasAttribute('valueAsNumber')).toBe(false);
  });
});

describe('Field native constraint attributes', () => {
  it('renders rules-derived native attributes', () => {
    render(
      <Form initialValues={{code: ''}}>
        <Field
          name="code"
          rules={{
            required: true,
            min: 2,
            max: 9,
            minLength: 3,
            maxLength: 8,
            pattern: {value: /^\d+$/, message: 'digits only'}
          }}
        />
      </Form>
    );
    const input = screen.getByRole('textbox');
    expect(input.required).toBe(true);
    expect(input.getAttribute('min')).toBe('2');
    expect(input.getAttribute('max')).toBe('9');
    expect(input.getAttribute('minLength')).toBe('3');
    expect(input.getAttribute('maxlength')).toBe('8');
    expect(input.getAttribute('pattern')).toBe('^\\d+$');
  });

  it('a user-passed attribute wins over the derived one', () => {
    render(
      <Form initialValues={{code: ''}}>
        <Field name="code" required={false} rules={{required: true}} />
      </Form>
    );
    const input = screen.getByRole('textbox');
    expect(input.hasAttribute('required')).toBe(false);
  });

  it('rule errors still land in the store and renderError', async () => {
    const form = createForm({initialValues: {code: ''}});
    render(
      <Form form={form}>
        <Field
          name="code"
          rules={{minLength: 3}}
          renderError={error => error}
        />
      </Form>
    );
    await act(() => trigger(form));
    expect(getErrors(form)).toEqual([
      {
        path: 'code',
        type: 'minLength',
        message: 'Must be at least 3 characters'
      }
    ]);
    expect(screen.getByRole('alert').textContent).toBe(
      'Must be at least 3 characters'
    );
  });

  it('rules.validate errors land typed by their key', async () => {
    const form = createForm({initialValues: {name: 'wmzy'}});
    render(
      <Form form={form}>
        <Field
          name="name"
          rules={{
            validate: {notWmzy: v => (v === 'wmzy' ? 'no wmzy' : undefined)}
          }}
        />
      </Form>
    );
    await act(() => trigger(form));
    expect(getErrors(form)).toEqual([
      {path: 'name', type: 'notWmzy', message: 'no wmzy'}
    ]);
  });
});

describe('Field uncontrolled DOM sync', () => {
  it('reset writes the baseline back into the DOM without a render', () => {
    const form = createForm({initialValues: {name: 'initial'}});
    render(
      <Form form={form}>
        <Field name="name" uncontrolled data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    expect(input.value).toBe('initial');
    fireEvent.change(input, {target: {value: 'typed'}});
    expect(input.value).toBe('typed');
    act(() => reset(form));
    expect(input.value).toBe('initial');
  });

  it('setInitialValues syncs the DOM', () => {
    const form = createForm({initialValues: {name: 'initial'}});
    render(
      <Form form={form}>
        <Field name="name" uncontrolled data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    fireEvent.change(input, {target: {value: 'typed'}});
    act(() => setInitialValues(form, {name: 'fresh'}));
    expect(input.value).toBe('fresh');
  });

  it('reset clears a removed value to an empty string', () => {
    const form = createForm({initialValues: {}});
    render(
      <Form form={form}>
        <Field name="name" uncontrolled initialValue="seeded" />
      </Form>
    );
    const input = screen.getByRole('textbox');
    expect(input.value).toBe('seeded');
    act(() => reset(form));
    expect(input.value).toBe('');
  });

  it('keeps typing render-free (uncontrolled contract intact)', async () => {
    const user = userEvent.setup();
    let renders = 0;
    function Probe() {
      renders += 1;
      return <Field name="name" uncontrolled data-testid="name-input" />;
    }
    render(
      <Form initialValues={{name: ''}}>
        <Probe />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    const before = renders;
    await user.type(input, 'hello world');
    expect(renders).toBe(before);
    expect(input.value).toBe('hello world');
  });
});

describe('Field native validation gate', () => {
  it('skips the custom validator on a native-failing kick by default', async () => {
    const user = userEvent.setup();
    const validate = vi.fn();
    const form = createForm({initialValues: {email: 'x'}, mode: 'onChange'});
    render(
      <Form form={form}>
        <Field name="email" required validate={validate} />
      </Form>
    );
    const input = screen.getByRole('textbox');
    // jsdom's constraint implementation is thin — pin the element's
    // verdict directly, exactly what the gate consults.
    const checkValidity = vi.fn(() => false);
    input.checkValidity = checkValidity;
    await user.clear(input);
    expect(checkValidity).toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });

  it('runs the custom validator when the form flag is false', async () => {
    const user = userEvent.setup();
    const validate = vi.fn(v => (v ? undefined : 'required'));
    const form = createForm({
      initialValues: {email: 'x'},
      mode: 'onChange',
      shouldUseNativeValidation: false
    });
    render(
      <Form form={form}>
        <Field name="email" required validate={validate} />
      </Form>
    );
    const input = screen.getByRole('textbox');
    const checkValidity = vi.fn(() => false);
    input.checkValidity = checkValidity;
    await user.clear(input);
    // The gate never consulted the DOM; the custom validator owns the kick.
    expect(checkValidity).not.toHaveBeenCalled();
    expect(validate).toHaveBeenCalledWith('', expect.anything());
  });

  it('seeds the internally created form from the <Form> prop', () => {
    function Probe() {
      const form = useFormContext();
      return (
        <span data-testid="probe">
          {String(form.shouldUseNativeValidation)}
        </span>
      );
    }
    render(
      <Form initialValues={{}} shouldUseNativeValidation={false}>
        <Probe />
      </Form>
    );
    expect(screen.getByTestId('probe').textContent).toBe('false');
  });
});
