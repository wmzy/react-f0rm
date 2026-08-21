import {describe, it, expect, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import Form from '../../src/components/Form';
import {Field, Checkbox} from '../../src/components/Field';
import createForm, {getErrors, setError} from '../../src/form';

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
      return <textarea {...props} value={value} onChange={e => onChange(e.target.value)} />;
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
          renderError={(error) => error}
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
        <Field name={['a', 0]} renderError={(error) => error} data-testid="a0" />
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
        <Field name="name" renderError={(error) => error} data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('stays headless without renderError even when there is an error', async () => {
    const form = createForm({initialValues: {name: ''}, mode: 'onBlur'});
    const user = userEvent.setup();
    render(
      <Form form={form}>
        <Field name="name" validate={() => 'oops'} data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    await user.click(input);
    await user.tab();
    await vi.waitFor(() => {
      expect(input.getAttribute('aria-invalid')).toBe('true');
    });
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not override a user-provided aria-label', async () => {
    const form = createForm({initialValues: {name: ''}});
    render(
      <Form form={form}>
        <Field
          name="name"
          aria-label="X"
          renderError={(error) => error}
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
          renderError={(error) => error}
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
    await act(async () => {
      setError(form, 'terms', 'must accept');
    });
    await vi.waitFor(() => {
      expect(checkbox.getAttribute('aria-invalid')).toBe('true');
    });
  });
});
