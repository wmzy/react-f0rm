import {describe, it, expect, vi} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {FormProvider} from '../../src/context';
import useValidate from '../../src/hooks/validate';
import useForm from '../../src/hooks/form';
import createForm, {getError, setValue, trigger} from '../../src/form';
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

  it('prefers an explicitly passed form over the context form', async () => {
    const wrapper = createWrapper();
    const inner = createForm();
    renderHook(() => useValidate(() => 'from inner', createPath('name'), inner), {
      wrapper
    });
    expect(inner.validators.has('["name"]')).toBe(true);
    await act(() => trigger(inner));
    expect(getError(inner, 'name')).toEqual({type: 'custom', message: 'from inner'});
  });

  it('passes an AbortSignal to the validator', () => {
    const form = createForm();
    let meta;
    const {result} = renderHook(() =>
      useValidate((_value, m) => {
        meta = m;
        return 'nope';
      }, createPath('name'), form)
    );
    act(() => result.current());
    expect(meta.form).toBe(form);
    expect(meta.path.key).toBe('["name"]');
    expect(meta.signal).toBeInstanceOf(AbortSignal);
    expect(meta.signal.aborted).toBe(false);
    expect(getError(form, 'name')).toEqual({type: 'custom', message: 'nope'});
  });

  it('aborts the previous round when a new one starts', () => {
    const form = createForm();
    const signals = [];
    const {result} = renderHook(() =>
      useValidate((_value, meta) => {
        signals.push(meta.signal);
        return undefined;
      }, createPath('name'), form)
    );
    act(() => result.current());
    act(() => result.current());
    expect(signals).toHaveLength(2);
    // The second round cancels the first; its own signal is live.
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it('debounces rapid kicks so only the last one validates', () => {
    vi.useFakeTimers();
    try {
      const form = createForm({initialValues: {name: ''}});
      const validate = vi.fn(value => (value ? undefined : 'required'));
      const {result} = renderHook(() =>
        useValidate(validate, createPath('name'), form, {debounce: 50})
      );
      act(() => result.current());
      act(() => result.current());
      expect(validate).not.toHaveBeenCalled();
      // The pending window counts as validating so trigger/ensureValidate
      // wait out the timer, not just in-flight promises.
      expect(form.validating.has('["name"]')).toBe(true);
      setValue(form, 'name', 'typed');
      act(() => result.current());
      act(() => vi.advanceTimersByTime(50));
      expect(validate).toHaveBeenCalledTimes(1);
      expect(validate.mock.calls[0][0]).toBe('typed');
      expect(form.validating.size).toBe(0);
      expect(getError(form, 'name')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the pending debounce timer on unmount without writing errors', () => {
    vi.useFakeTimers();
    try {
      const form = createForm();
      const validate = vi.fn(() => 'required');
      const {result, unmount} = renderHook(() =>
        useValidate(validate, createPath('name'), form, {debounce: 50})
      );
      act(() => result.current());
      expect(form.validating.size).toBe(1);
      unmount();
      act(() => vi.advanceTimersByTime(100));
      expect(validate).not.toHaveBeenCalled();
      expect(getError(form, 'name')).toBeUndefined();
      expect(form.validating.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('trigger waits out the debounce window and reports the settled result', async () => {
    vi.useFakeTimers();
    try {
      const form = createForm();
      renderHook(() =>
        useValidate(
          value => (value ? undefined : 'required'),
          createPath('name'),
          form,
          {debounce: 50}
        )
      );
      const pending = trigger(form);
      // Debounce pending: trigger must not resolve while the timer runs.
      expect(form.validating.size).toBe(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      await expect(pending).resolves.toBe(false);
      expect(getError(form, 'name')).toEqual({type: 'custom', message: 'required'});
    } finally {
      vi.useRealTimers();
    }
  });
});
