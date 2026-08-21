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

  it('works with an explicitly passed form and no FormProvider', () => {
    const form = createForm({validateOnChange: true});
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
    // subscribed field re-renders with it.
    act(() => trigger(form));
    expect(getError(form, 'email')).toEqual({type: 'custom', message: 'required'});
    expect(field.error).toBe('required');

    // Typing revalidates against the same form instance and clears it.
    act(() => field.onChange('a@b.c'));
    expect(field.error).toBeUndefined();
    expect(getError(form, 'email')).toBeUndefined();
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
});
