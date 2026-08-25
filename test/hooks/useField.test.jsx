import {describe, it, expect, vi} from 'vitest';
import {renderHook, render, act} from '@testing-library/react';
import {on} from '@for-fun/event-emitter';
import {FormProvider} from '../../src/context';
import useField from '../../src/hooks/field';
import useForm from '../../src/hooks/form';
import createForm, {
  getValues,
  setValue,
  getError,
  setError,
  trigger,
  ensureValidate,
  setDisabled
} from '../../src/form';
import React from 'react';

function createWrapper(initialValues) {
  return function Wrapper({children}) {
    const form = useForm({initialValues});
    return <FormProvider value={form}>{children}</FormProvider>;
  };
}

const wrapper = createWrapper({name: 'test'});

describe('useField', () => {
  it('returns field state', () => {
    const {result} = renderHook(() => useField({name: 'name'}), {wrapper});
    expect(result.current.value).toBe('test');
    expect(result.current.error).toBeUndefined();
    expect(result.current.name).toBe('["name"]');
  });

  it('provides onChange handler', () => {
    const {result} = renderHook(() => useField({name: 'name'}), {wrapper});
    expect(typeof result.current.onChange).toBe('function');
    act(() => result.current.onChange('changed'));
    expect(result.current.value).toBe('changed');
  });

  it('provides onBlur handler', () => {
    const {result} = renderHook(() => useField({name: 'name'}), {wrapper});
    expect(typeof result.current.onBlur).toBe('function');
    act(() => result.current.onBlur());
  });

  it('uses initialValue when provided', () => {
    const {result} = renderHook(
      () => useField({name: 'email', initialValue: 'default@test.com'}),
      {wrapper}
    );
    expect(result.current.value).toBe('default@test.com');
  });

  it('writes initialValue only once under StrictMode double render', () => {
    const form = createForm();
    const spy = vi.fn();
    on(form.emitter, 'change', spy);
    renderHook(
      () =>
        useField({
          form,
          name: 'email',
          initialValue: 'default@test.com',
          shouldUnregister: false
        }),
      {
        wrapper: ({children}) => (
          <React.StrictMode>
            <FormProvider value={form}>{children}</FormProvider>
          </React.StrictMode>
        )
      }
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite an existing value with initialValue', () => {
    const form = createForm();
    setValue(form, 'email', 'preset@test.com');
    const {result} = renderHook(
      () => useField({form, name: 'email', initialValue: 'default@test.com'}),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );
    expect(result.current.value).toBe('preset@test.com');
  });

  it('keeps typed value when the field remounts with initialValue', () => {
    const form = createForm();
    const provider = ({children}) => (
      <FormProvider value={form}>{children}</FormProvider>
    );
    const first = renderHook(
      () =>
        useField({
          form,
          name: 'email',
          initialValue: 'default@test.com',
          shouldUnregister: false
        }),
      {wrapper: provider}
    );
    act(() => first.result.current.onChange('typed@test.com'));
    first.unmount();
    const second = renderHook(
      () =>
        useField({
          form,
          name: 'email',
          initialValue: 'default@test.com',
          shouldUnregister: false
        }),
      {wrapper: provider}
    );
    expect(second.result.current.value).toBe('typed@test.com');
  });

  it('preserves value on unmount when shouldUnregister is false', () => {
    const initialValues = {name: 'test'};
    const w = createWrapper(initialValues);
    const {result, unmount} = renderHook(
      () => useField({name: 'name', shouldUnregister: false}),
      {wrapper: w}
    );
    act(() => result.current.onChange('changed'));
    unmount();
    // Value should still be in the form after unmount
  });

  it('removes value on unmount when shouldUnregister is true', () => {
    const form = createForm({initialValues: {name: 'test'}});
    const w = ({children}) => (
      <FormProvider value={form}>{children}</FormProvider>
    );
    const {result, unmount} = renderHook(
      () => useField({name: 'name', shouldUnregister: true}),
      {wrapper: w}
    );
    act(() => result.current.onChange('changed'));
    unmount();
    // Unregistered path is tombstoned: the value must not fall back to
    // initialValues.name ('test') after unmount.
    expect(getValues(form).name).toBeUndefined();
    expect('name' in getValues(form)).toBe(false);
  });

  it('remounted field writes new values over its own tombstone', () => {
    const form = createForm({initialValues: {name: 'test'}});
    const w = ({children}) => (
      <FormProvider value={form}>{children}</FormProvider>
    );
    const first = renderHook(() => useField({name: 'name'}), {wrapper: w});
    act(() => first.result.current.onChange('typed'));
    first.unmount();
    expect(getValues(form).name).toBeUndefined();
    const second = renderHook(() => useField({name: 'name'}), {wrapper: w});
    act(() => second.result.current.onChange('retyped'));
    expect(second.result.current.value).toBe('retyped');
    expect(getValues(form)).toEqual({name: 'retyped'});
  });

  it('works with an explicitly passed form and no FormProvider', async () => {
    // Default mode: no validation until an error exists, then every change
    // re-validates (onSubmit + reValidateMode 'onChange').
    const form = createForm();
    let field;
    function CustomField(props) {
      field = useField(props);
      return (
        <input
          name={field.name}
          value={field.value ?? ''}
          onChange={e => field.onChange(e.target.value)}
        />
      );
    }

    const {container} = render(
      <CustomField
        form={form}
        name="email"
        validate={value => (value ? undefined : 'required')}
      />
    );

    // Renders without throwing and reflects initial state.
    expect(container.querySelector('input').value).toBe('');
    expect(field.error).toBeUndefined();

    // The validator is registered on the passed form instance.
    expect(form.validators.has('["email"]')).toBe(true);

    // Triggering validation through the form marks the error, and the
    // subscribed field re-renders with it. trigger resolves once validation
    // settles, so await it inside act to flush the re-render.
    await act(() => trigger(form));
    expect(getError(form, 'email')).toEqual({
      type: 'custom',
      message: 'required'
    });
    expect(field.error).toBe('required');

    // Typing revalidates against the same form instance and clears it.
    act(() => field.onChange('a@b.c'));
    expect(field.error).toBeUndefined();
    expect(getError(form, 'email')).toBeUndefined();
  });

  it('validates on first blur then on every change with mode onTouched', () => {
    const form = createForm({initialValues: {name: ''}, mode: 'onTouched'});
    const validate = vi.fn(value => (value ? undefined : 'required'));
    const {result} = renderHook(
      () => useField({form, name: 'name', validate}),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );

    // Untouched: changes do not validate yet.
    act(() => result.current.onChange('a'));
    expect(validate).not.toHaveBeenCalled();
    expect(result.current.error).toBeUndefined();

    // First blur validates (the typed value is still valid).
    act(() => result.current.onBlur());
    expect(validate).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeUndefined();

    // After touch, every change validates — clearing to empty marks the error.
    act(() => result.current.onChange(''));
    expect(validate).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe('required');

    // Typing again re-validates on change and clears it.
    act(() => result.current.onChange('b'));
    expect(validate).toHaveBeenCalledTimes(3);
    expect(result.current.error).toBeUndefined();
  });

  it('validates on both change and blur with mode all', () => {
    const form = createForm({initialValues: {name: ''}, mode: 'all'});
    const validate = vi.fn(value => (value ? undefined : 'required'));
    const {result} = renderHook(
      () => useField({form, name: 'name', validate}),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );

    act(() => result.current.onChange(''));
    expect(validate).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('required');

    act(() => result.current.onBlur());
    expect(validate).toHaveBeenCalledTimes(2);

    act(() => result.current.onChange('ok'));
    expect(validate).toHaveBeenCalledTimes(3);
    expect(result.current.error).toBeUndefined();
  });

  it('exposes nested form-level errors while keeping error a message string', async () => {
    const form = createForm({
      initialValues: {a: {b: ''}},
      validate: () => ({a: {b: 'msg'}})
    });
    const {result} = renderHook(() => useField({form, name: 'a.b'}), {
      wrapper: ({children}) => (
        <FormProvider value={form}>{children}</FormProvider>
      )
    });
    expect(result.current.error).toBeUndefined();
    expect(result.current.errorObject).toBeUndefined();

    await act(async () => {
      await ensureValidate(form).catch(() => {});
    });

    expect(result.current.error).toBe('msg');
    expect(result.current.errorObject).toEqual({
      type: 'custom',
      message: 'msg'
    });
  });

  it('debounces validation through validateDebounce', () => {
    vi.useFakeTimers();
    try {
      const form = createForm({initialValues: {name: ''}, mode: 'all'});
      const validate = vi.fn(value => (value ? undefined : 'required'));
      const {result} = renderHook(
        () => useField({form, name: 'name', validate, validateDebounce: 30}),
        {
          wrapper: ({children}) => (
            <FormProvider value={form}>{children}</FormProvider>
          )
        }
      );
      act(() => result.current.onChange('a'));
      act(() => result.current.onChange('ab'));
      expect(validate).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(30));
      expect(validate).toHaveBeenCalledTimes(1);
      expect(validate.mock.calls[0][0]).toBe('ab');
      expect(result.current.error).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps validateDebounce out of the spread rest props', () => {
    const {result} = renderHook(
      () => useField({name: 'name', validateDebounce: 30}),
      {wrapper}
    );
    // It must not leak through `rest` onto DOM elements.
    expect('validateDebounce' in result.current).toBe(false);
  });

  it('drops undeclared options instead of echoing them on the result', () => {
    const {result} = renderHook(
      () => useField({name: 'name', placeholder: 'type here', className: 'x'}),
      {wrapper}
    );
    // Unknown options were historically merged back into the result (an
    // implicit passthrough onto DOM elements). The result is now a closed
    // shape: it exposes exactly its declared fields.
    expect('placeholder' in result.current).toBe(false);
    expect('className' in result.current).toBe(false);
    expect(Object.keys(result.current).sort()).toEqual([
      'disabled',
      'error',
      'errorObject',
      'errors',
      'form',
      'name',
      'onBlur',
      'onChange',
      'value'
    ]);
  });

  it('exposes every registered error while error/errorObject keep the first', () => {
    const form = createForm({initialValues: {name: ''}});
    const {result} = renderHook(() => useField({form, name: 'name'}), {
      wrapper: ({children}) => (
        <FormProvider value={form}>{children}</FormProvider>
      )
    });
    expect(result.current.errors).toEqual([]);

    act(() =>
      setError(form, 'name', ['required', {type: 'min', message: 'too short'}])
    );
    expect(result.current.errors).toEqual([
      {type: 'custom', message: 'required'},
      {type: 'min', message: 'too short'}
    ]);
    // The single-error surface still points at the first entry.
    expect(result.current.error).toBe('required');
    expect(result.current.errorObject).toEqual({
      type: 'custom',
      message: 'required'
    });

    act(() => setError(form, 'name', undefined));
    expect(result.current.errors).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });

  it('keeps the errors array reference-stable across unrelated renders', () => {
    const form = createForm({initialValues: {name: ''}});
    const {result, rerender} = renderHook(
      () => useField({form, name: 'name'}),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );
    // No errors: the shared empty-array constant, same reference always.
    const empty = result.current.errors;
    rerender();
    expect(result.current.errors).toBe(empty);
    // With errors stored, the Map's own array is handed out by reference.
    act(() => setError(form, 'name', ['a', 'b']));
    const stored = result.current.errors;
    rerender();
    expect(result.current.errors).toBe(stored);
  });

  it('stores every error a validate function returns as an array', async () => {
    const form = createForm({initialValues: {name: ''}});
    const {result} = renderHook(
      () =>
        useField({
          form,
          name: 'name',
          validate: value =>
            value
              ? undefined
              : ['required', {type: 'min', message: 'too short'}]
        }),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );
    await act(() => trigger(form));
    expect(result.current.errors).toEqual([
      {type: 'custom', message: 'required'},
      {type: 'min', message: 'too short'}
    ]);
    expect(result.current.error).toBe('required');
  });

  it('runs rules with required short-circuiting the rest on empty values', () => {
    const form = createForm({initialValues: {age: ''}, mode: 'all'});
    const {result} = renderHook(
      () =>
        useField({
          form,
          name: 'age',
          rules: {required: '必填', min: 18, max: 99}
        }),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );

    // Empty value: only the required error — min/max must not pile on.
    act(() => result.current.onChange(''));
    expect(result.current.errors).toEqual([
      {type: 'required', message: '必填'}
    ]);
    expect(result.current.error).toBe('必填');

    // '10' passes required but fails min with the default message.
    act(() => result.current.onChange('10'));
    expect(result.current.errors).toEqual([
      {type: 'min', message: 'Must be at least 18'}
    ]);

    // Above the max bound.
    act(() => result.current.onChange('200'));
    expect(result.current.errors).toEqual([
      {type: 'max', message: 'Must be at most 99'}
    ]);

    // In range clears.
    act(() => result.current.onChange('42'));
    expect(result.current.errors).toEqual([]);
  });

  it('uses the default required message for required: true and treats 0/false as filled', () => {
    const form = createForm({initialValues: {count: ''}, mode: 'all'});
    const {result} = renderHook(
      () => useField({form, name: 'count', rules: {required: true}}),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );

    act(() => result.current.onChange(''));
    expect(result.current.errors).toEqual([
      {type: 'required', message: 'This field is required'}
    ]);

    // 0 and false are values, not empties.
    act(() => result.current.onChange(0));
    expect(result.current.errors).toEqual([]);
    act(() => result.current.onChange(false));
    expect(result.current.errors).toEqual([]);
  });

  it('collects minLength, maxLength and pattern failures together', () => {
    const form = createForm({initialValues: {code: ''}, mode: 'all'});
    const {result} = renderHook(
      () =>
        useField({
          form,
          name: 'code',
          rules: {
            minLength: 3,
            maxLength: 5,
            pattern: {value: /^\d+$/, message: 'Digits only'}
          }
        }),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );

    // Too short and non-numeric: both collected, declaration order.
    act(() => result.current.onChange('ab'));
    expect(result.current.errors).toEqual([
      {type: 'minLength', message: 'Must be at least 3 characters'},
      {type: 'pattern', message: 'Digits only'}
    ]);

    // Too long and non-numeric.
    act(() => result.current.onChange('abcdef'));
    expect(result.current.errors).toEqual([
      {type: 'maxLength', message: 'Must be at most 5 characters'},
      {type: 'pattern', message: 'Digits only'}
    ]);

    // Everything passes: cleared.
    act(() => result.current.onChange('1234'));
    expect(result.current.errors).toEqual([]);
  });

  it('overrides default rule messages through messages', () => {
    const form = createForm({initialValues: {age: ''}, mode: 'all'});
    const {result} = renderHook(
      () =>
        useField({
          form,
          name: 'age',
          rules: {min: 18, messages: {min: '太小了', pattern: '格式错误'}}
        }),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );

    act(() => result.current.onChange('10'));
    expect(result.current.errors).toEqual([{type: 'min', message: '太小了'}]);
  });

  it('merges rules errors ahead of validate errors', () => {
    const form = createForm({initialValues: {name: ''}, mode: 'all'});
    const {result} = renderHook(
      () =>
        useField({
          form,
          name: 'name',
          rules: {minLength: 3},
          validate: value =>
            value.includes('!')
              ? {type: 'custom', message: 'no exclamation'}
              : undefined
        }),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );

    // Both fail: rules error first, validate error after.
    act(() => result.current.onChange('a!'));
    expect(result.current.errors).toEqual([
      {type: 'minLength', message: 'Must be at least 3 characters'},
      {type: 'custom', message: 'no exclamation'}
    ]);

    // Only rules fail.
    act(() => result.current.onChange('ab'));
    expect(result.current.errors).toEqual([
      {type: 'minLength', message: 'Must be at least 3 characters'}
    ]);

    // Only validate fails.
    act(() => result.current.onChange('ok!'));
    expect(result.current.errors).toEqual([
      {type: 'custom', message: 'no exclamation'}
    ]);

    // Both pass: cleared.
    act(() => result.current.onChange('okay'));
    expect(result.current.errors).toEqual([]);
  });

  it('awaits an async validate and merges its errors after rules errors', async () => {
    const form = createForm({initialValues: {name: ''}});
    const {result} = renderHook(
      () =>
        useField({
          form,
          name: 'name',
          rules: {minLength: 3},
          validate: async value => (value ? undefined : 'async required')
        }),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );

    await act(() => trigger(form));
    expect(result.current.errors).toEqual([
      {type: 'minLength', message: 'Must be at least 3 characters'},
      {type: 'custom', message: 'async required'}
    ]);
  });

  it('runs rules on blur with mode onBlur', () => {
    const form = createForm({initialValues: {age: ''}, mode: 'onBlur'});
    const {result} = renderHook(
      () => useField({form, name: 'age', rules: {min: 18}}),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );

    // Typing does not validate yet in onBlur mode.
    act(() => result.current.onChange('10'));
    expect(result.current.errors).toEqual([]);

    // Blur runs the rules.
    act(() => result.current.onBlur());
    expect(result.current.errors).toEqual([
      {type: 'min', message: 'Must be at least 18'}
    ]);
  });

  it('keeps rules out of the spread rest props', () => {
    const {result} = renderHook(
      () => useField({name: 'name', rules: {required: true}}),
      {wrapper}
    );
    // It must not leak through `rest` onto DOM elements.
    expect('rules' in result.current).toBe(false);
  });

  it('delays a newly appearing error by delayError while state stays immediate', () => {
    vi.useFakeTimers();
    try {
      const form = createForm({initialValues: {name: ''}, mode: 'all'});
      const {result} = renderHook(
        () =>
          useField({
            form,
            name: 'name',
            validate: value => (value ? undefined : 'required'),
            delayError: 50
          }),
        {
          wrapper: ({children}) => (
            <FormProvider value={form}>{children}</FormProvider>
          )
        }
      );

      act(() => result.current.onChange(''));
      // The state layer is never delayed: trigger/submit read it at once.
      expect(getError(form, 'name')).toEqual({
        type: 'custom',
        message: 'required'
      });
      // The render layer stays hidden inside the window.
      expect(result.current.error).toBeUndefined();
      expect(result.current.errorObject).toBeUndefined();
      expect(result.current.errors).toEqual([]);

      act(() => vi.advanceTimersByTime(49));
      expect(result.current.error).toBeUndefined();

      act(() => vi.advanceTimersByTime(1));
      expect(result.current.error).toBe('required');
      expect(result.current.errorObject).toEqual({
        type: 'custom',
        message: 'required'
      });
      expect(result.current.errors).toEqual([
        {type: 'custom', message: 'required'}
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never shows an error that clears inside the delayError window', () => {
    vi.useFakeTimers();
    try {
      const form = createForm({initialValues: {name: ''}, mode: 'all'});
      const {result} = renderHook(
        () =>
          useField({
            form,
            name: 'name',
            validate: value => (value ? undefined : 'required'),
            delayError: 50
          }),
        {
          wrapper: ({children}) => (
            <FormProvider value={form}>{children}</FormProvider>
          )
        }
      );

      act(() => result.current.onChange(''));
      expect(getError(form, 'name')).toBeDefined();
      expect(result.current.error).toBeUndefined();

      // Fixing the value inside the window re-validates against the live
      // error and cancels the pending first show.
      act(() => result.current.onChange('ok'));
      expect(getError(form, 'name')).toBeUndefined();

      act(() => vi.advanceTimersByTime(100));
      expect(result.current.error).toBeUndefined();
      expect(result.current.errors).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies changes to an already visible error immediately', () => {
    vi.useFakeTimers();
    try {
      const form = createForm({initialValues: {name: ''}, mode: 'all'});
      const {result} = renderHook(
        () =>
          useField({
            form,
            name: 'name',
            validate: value =>
              value.length >= 5 ? undefined : value ? 'too short' : 'required',
            delayError: 50
          }),
        {
          wrapper: ({children}) => (
            <FormProvider value={form}>{children}</FormProvider>
          )
        }
      );

      act(() => result.current.onChange(''));
      act(() => vi.advanceTimersByTime(50));
      expect(result.current.error).toBe('required');

      // Swapping the message while the error is visible: no new window.
      act(() => result.current.onChange('abc'));
      expect(result.current.error).toBe('too short');

      // Adding an entry: the list updates at once too.
      act(() =>
        setError(form, 'name', ['too short', {type: 'custom', message: 'also'}])
      );
      expect(result.current.errors).toEqual([
        {type: 'custom', message: 'too short'},
        {type: 'custom', message: 'also'}
      ]);

      // Clearing a visible error hides it at once.
      act(() => setError(form, 'name', undefined));
      expect(result.current.error).toBeUndefined();
      expect(result.current.errors).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes the merged disabled flag and tracks setDisabled', () => {
    const form = createForm({initialValues: {name: ''}});
    const {result} = renderHook(() => useField({form, name: 'name'}), {
      wrapper: ({children}) => (
        <FormProvider value={form}>{children}</FormProvider>
      )
    });
    expect(result.current.disabled).toBe(false);

    act(() => setDisabled(form, true));
    expect(result.current.disabled).toBe(true);

    act(() => setDisabled(form, false));
    expect(result.current.disabled).toBe(false);
  });

  it('ORs the field disabled option with the form-level flag', () => {
    const form = createForm({initialValues: {name: ''}, disabled: true});
    const {result} = renderHook(
      () => useField({form, name: 'name', disabled: true}),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );
    // The form flag alone suffices...
    expect(result.current.disabled).toBe(true);

    // ...and the field's own option keeps it disabled once the form flag
    // lifts.
    act(() => setDisabled(form, false));
    expect(result.current.disabled).toBe(true);
  });

  it('keeps delayError and disabled independent', () => {
    vi.useFakeTimers();
    try {
      const form = createForm({initialValues: {name: ''}, mode: 'all'});
      const {result} = renderHook(
        () =>
          useField({
            form,
            name: 'name',
            validate: value => (value ? undefined : 'required'),
            delayError: 50
          }),
        {
          wrapper: ({children}) => (
            <FormProvider value={form}>{children}</FormProvider>
          )
        }
      );

      act(() => setDisabled(form, true));
      act(() => result.current.onChange(''));
      // Disabled arrives at once; the error stays gated by its window.
      expect(result.current.disabled).toBe(true);
      expect(result.current.error).toBeUndefined();

      act(() => vi.advanceTimersByTime(50));
      expect(result.current.error).toBe('required');
      expect(result.current.disabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('merges rules errors with a validate that returns an array', () => {
    const form = createForm({initialValues: {name: 'a'}, mode: 'all'});
    const {result} = renderHook(
      () =>
        useField({
          form,
          name: 'name',
          rules: {maxLength: 3},
          validate: value =>
            value.includes('!')
              ? ['no exclamation', {type: 'x', message: 'y'}]
              : undefined
        }),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );

    act(() => result.current.onChange('ab!'));
    expect(result.current.errors).toEqual([
      {type: 'custom', message: 'no exclamation'},
      {type: 'x', message: 'y'}
    ]);

    // Both rule failure and array validate output land in declaration order.
    act(() => result.current.onChange('abcd!'));
    expect(result.current.errors).toEqual([
      {type: 'maxLength', message: 'Must be at most 3 characters'},
      {type: 'custom', message: 'no exclamation'},
      {type: 'x', message: 'y'}
    ]);
  });

  it('re-validates on blur (not change) with reValidateMode onBlur', () => {
    const form = createForm({
      initialValues: {name: ''},
      reValidateMode: 'onBlur'
    });
    const validate = vi.fn(value => (value ? undefined : 'required'));
    const {result} = renderHook(
      () => useField({form, name: 'name', validate}),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );

    // Seed an error directly so the reValidateMode window opens without
    // needing a validating blur first (mode stays 'onSubmit').
    act(() => setError(form, 'name', 'seed'));

    // A change must not re-validate while reValidateMode is onBlur...
    act(() => result.current.onChange('x'));
    expect(validate).toHaveBeenCalledTimes(0);

    // ...but the next blur does.
    act(() => result.current.onBlur());
    expect(validate).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeUndefined();
  });

  it('falls back to the default pattern message when none is given', () => {
    // pattern.message is type-required, but JS consumers may omit it.
    const form = createForm({initialValues: {code: ''}, mode: 'all'});
    const {result} = renderHook(
      () => useField({form, name: 'code', rules: {pattern: {value: /^\d+$/}}}),
      {
        wrapper: ({children}) => (
          <FormProvider value={form}>{children}</FormProvider>
        )
      }
    );

    act(() => result.current.onChange('ab'));
    expect(result.current.errors).toEqual([
      {type: 'pattern', message: 'Invalid format'}
    ]);
  });
});
