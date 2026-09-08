import {describe, it, expect, vi} from 'vitest';
import {on} from '../../src/emitter';
import createForm, {getValue, setValue, reset, getValues} from '../../src/form';

describe('createForm', () => {
  it('creates a form instance', () => {
    const form = createForm();
    expect(form.values).toBeInstanceOf(Map);
    expect(form.errors).toBeInstanceOf(Map);
    expect(form.touched).toBeInstanceOf(Set);
    expect(form.validators).toBeInstanceOf(Map);
    expect(form.validating).toBeInstanceOf(Set);
    expect(form.mode).toBe('onSubmit');
    expect(form.reValidateMode).toBe('onChange');
    expect(form.disabled).toBe(false);
  });

  it('merges options', () => {
    const form = createForm({
      initialValues: {name: 'test'},
      mode: 'onTouched',
      reValidateMode: 'onBlur',
      disabled: true
    });
    expect(form.initialValues).toEqual({name: 'test'});
    expect(form.mode).toBe('onTouched');
    expect(form.reValidateMode).toBe('onBlur');
    expect(form.disabled).toBe(true);
  });
});

describe('async initialValues', () => {
  it('seeds a sync thunk immediately without a loading cycle', () => {
    const form = createForm({initialValues: () => ({email: 'a@b.c'})});
    expect(form.isLoading).toBe(false);
    expect(getValue(form, 'email')).toBe('a@b.c');
  });

  it('starts empty and loading, then lands resolved values as the baseline', async () => {
    const form = createForm({
      initialValues: () => Promise.resolve({email: 'a@b.c', tags: ['x']})
    });
    expect(form.isLoading).toBe(true);
    expect(getValues(form)).toEqual({});
    await vi.waitFor(() => expect(form.isLoading).toBe(false));
    expect(getValue(form, 'email')).toBe('a@b.c');
    expect(getValues(form)).toEqual({email: 'a@b.c', tags: ['x']});
    // The resolved values are the baseline: a later reset returns to them.
    setValue(form, 'email', 'edited');
    reset(form);
    expect(getValue(form, 'email')).toBe('a@b.c');
  });

  it('accepts a bare Promise and emits loading around the cycle', async () => {
    const events = [];
    const form = createForm({initialValues: Promise.resolve({n: 1})});
    // The first (true) emit fires synchronously at create — before any
    // subscriber can exist — so only the settling emit is observable;
    // the flag itself started true.
    on(form.emitter, 'loading', () => events.push(form.isLoading));
    await vi.waitFor(() => expect(form.isLoading).toBe(false));
    expect(events).toEqual([false]);
    expect(getValue(form, 'n')).toBe(1);
  });

  it('flips loading off and keeps the form empty on rejection', async () => {
    const form = createForm({
      initialValues: Promise.reject(new Error('boom'))
    });
    expect(form.isLoading).toBe(true);
    await vi.waitFor(() => expect(form.isLoading).toBe(false));
    expect(getValues(form)).toEqual({});
  });
});
