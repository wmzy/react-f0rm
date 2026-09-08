// Mount validation (`validateOnMount`): the form-level flag, the per-field
// override in either direction, the deferral behind async initialValues,
// the form-level validate run, and the validator-less no-kick guard.
import {describe, it, expect, vi} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import React from 'react';
import {FormProvider} from '../../src/context';
import useField from '../../src/hooks/field';
import useForm from '../../src/hooks/form';
import createForm, {getError, setServerErrors} from '../../src/form';

function createWrapper(options) {
  return function Wrapper({children}) {
    const form = useForm(options);
    return <FormProvider value={form}>{children}</FormProvider>;
  };
}

describe('validateOnMount', () => {
  it('form-level flag: a required field shows its error right after mount', () => {
    const wrapper = createWrapper({
      initialValues: {email: ''},
      validateOnMount: true
    });
    const {result} = renderHook(
      () => useField({name: 'email', rules: {required: 'Email is required'}}),
      {wrapper}
    );
    expect(result.current.error).toBe('Email is required');
    expect(result.current.value).toBe('');
  });

  it('per-field option kicks on mount without the form-level flag', () => {
    const wrapper = createWrapper({initialValues: {age: 0}});
    const {result} = renderHook(
      () =>
        useField({
          name: 'age',
          validateOnMount: true,
          validate: v => (v > 0 ? undefined : 'Age is required')
        }),
      {wrapper}
    );
    expect(result.current.error).toBe('Age is required');
  });

  it('per-field false opts out of a validating form', () => {
    const wrapper = createWrapper({
      initialValues: {email: ''},
      validateOnMount: true
    });
    const {result} = renderHook(
      () =>
        useField({
          name: 'email',
          validateOnMount: false,
          rules: {required: 'Email is required'}
        }),
      {wrapper}
    );
    expect(result.current.error).toBeUndefined();
  });

  it('mount validation never marks the field touched', () => {
    const wrapper = createWrapper({
      initialValues: {email: ''},
      validateOnMount: true
    });
    const {result} = renderHook(
      () => useField({name: 'email', rules: {required: 'Email is required'}}),
      {wrapper}
    );
    expect(result.current.error).toBe('Email is required');
    const form = result.current.form;
    expect(form.touched.has('["email"]')).toBe(false);
  });

  it('deferred behind async initialValues: no kick on the empty shell, one after resolution', async () => {
    let resolveSource;
    const source = new Promise(resolve => {
      resolveSource = resolve;
    });
    const form = createForm({
      initialValues: source,
      validateOnMount: true
    });
    const {result} = renderHook(
      () =>
        useField({
          form,
          name: 'email',
          rules: {required: 'Email is required'}
        }),
      {wrapper: ({children}) => <>{children}</>}
    );

    // While loading, the mount kick is deferred: validating the empty
    // shell would land a spurious required error.
    expect(form.isLoading).toBe(true);
    expect(result.current.error).toBeUndefined();
    expect(getError(form, 'email')).toBeUndefined();

    await act(async () => {
      resolveSource({email: ''});
      await source;
      await Promise.resolve();
    });
    expect(form.isLoading).toBe(false);
    // The landed baseline (empty email) now fails the required rule.
    expect(result.current.error).toBe('Email is required');
    expect(getError(form, 'email')?.message).toBe('Email is required');
  });

  it('runs the form-level validate once on mount', async () => {
    const runs = vi.fn(values =>
      values.password === 'secret' ? undefined : {password: 'too weak'}
    );
    const {result} = renderHook(() =>
      useForm({
        initialValues: {password: 'x'},
        validate: runs,
        validateOnMount: true
      })
    );
    await act(async () => {});
    expect(runs).toHaveBeenCalledTimes(1);
    const form = result.current;
    expect(getError(form, 'password')?.message).toBe('too weak');
  });

  it('without validateOnMount the form-level validate never runs on mount', async () => {
    const runs = vi.fn(() => undefined);
    const {result} = renderHook(() =>
      useForm({initialValues: {}, validate: runs})
    );
    await act(async () => {});
    expect(runs).not.toHaveBeenCalled();
    expect(result.current.validate).toBe(runs);
  });

  it('a validator-less field never kicks on mount — server errors survive', () => {
    const form = createForm({
      initialValues: {email: ''},
      validateOnMount: true
    });
    setServerErrors(form, {email: 'Taken'});
    const {result} = renderHook(() => useField({form, name: 'email'}), {
      wrapper: ({children}) => <>{children}</>
    });
    // The field registers (validator-less), so no kick runs — a kick with
    // nothing to validate would clear the pre-mounted server error.
    expect(result.current.error).toBe('Taken');
    expect(getError(form, 'email')?.message).toBe('Taken');
  });
});
