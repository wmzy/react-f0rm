import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {FormProvider} from '../../src/context';
import useValidate from '../../src/hooks/validate';
import useForm from '../../src/hooks/form';
import createForm, {getError, trigger} from '../../src/form';
import createPath from '../../src/path';
import React from 'react';

function createWrapper(initialValues = {}) {
  return function Wrapper({children}) {
    const form = useForm({initialValues});
    return <FormProvider value={form}>{children}</FormProvider>;
  };
}

describe('useValidate', () => {
  it('registers validator on mount', () => {
    const wrapper = createWrapper();
    const {result} = renderHook(
      () => {
        const form = useForm({initialValues: {}});
        const path = createPath('name');
        const validator = useValidate(() => undefined, path);
        return {form, validator};
      },
      {wrapper}
    );
    expect(typeof result.current.validator).toBe('function');
  });

  it('returns a callable validator function', () => {
    const wrapper = createWrapper({name: 'test'});
    const {result} = renderHook(
      () =>
        useValidate(
          value => (value ? undefined : 'required'),
          createPath('name')
        ),
      {wrapper}
    );
    expect(typeof result.current).toBe('function');
  });

  it('uses an explicitly passed form without a FormProvider', () => {
    const form = createForm();
    const {result} = renderHook(() =>
      useValidate(value => (value ? undefined : 'required'), createPath('name'), form)
    );
    expect(form.validators.has('["name"]')).toBe(true);
    act(() => result.current());
    expect(getError(form, 'name')).toEqual({type: 'custom', message: 'required'});
  });

  it('prefers an explicitly passed form over the context form', () => {
    const wrapper = createWrapper();
    const inner = createForm();
    renderHook(() => useValidate(() => 'from inner', createPath('name'), inner), {
      wrapper
    });
    expect(inner.validators.has('["name"]')).toBe(true);
    act(() => trigger(inner));
    expect(getError(inner, 'name')).toEqual({type: 'custom', message: 'from inner'});
  });
});
