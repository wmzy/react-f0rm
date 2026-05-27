import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {FormProvider} from '../../src/context';
import useField from '../../src/hooks/field';
import useForm from '../../src/hooks/form';
import {getValues} from '../../src/form';
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
    const initialValues = {name: 'test'};
    const w = createWrapper(initialValues);
    const {result, unmount} = renderHook(
      () => useField({name: 'name', shouldUnregister: true}),
      {wrapper: w}
    );
    act(() => result.current.onChange('changed'));
    unmount();
  });
});
