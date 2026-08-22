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
  ensureValidate
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
      {wrapper: ({children}) => <FormProvider value={form}>{children}</FormProvider>}
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
    expect(getError(form, 'email')).toEqual({type: 'custom', message: 'required'});
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
      {wrapper: ({children}) => <FormProvider value={form}>{children}</FormProvider>}
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
      {wrapper: ({children}) => <FormProvider value={form}>{children}</FormProvider>}
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
    expect(result.current.errorObject).toEqual({type: 'custom', message: 'msg'});
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
});
