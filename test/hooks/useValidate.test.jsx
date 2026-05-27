import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {FormProvider} from '../../src/context';
import useValidate from '../../src/hooks/validate';
import useForm from '../../src/hooks/form';
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
});
