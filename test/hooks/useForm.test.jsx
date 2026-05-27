import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import useForm, {
  useValue,
  useError,
  useTouched,
  useIsDirty,
  useHasErrors
} from '../../src/hooks/form';
import {setValue, setError, setTouched} from '../../src/form';

describe('useForm', () => {
  it('returns a form instance', () => {
    const initialValues = {name: 'test'};
    const {result} = renderHook(() => useForm({initialValues}));
    expect(result.current).toBeDefined();
    expect(result.current.values).toBeInstanceOf(Map);
  });

  it('returns same instance on rerender', () => {
    const initialValues = {name: 'test'};
    const {result, rerender} = renderHook(
      ({initialValues}) => useForm({initialValues}),
      {initialProps: {initialValues}}
    );
    const form1 = result.current;
    rerender({initialValues});
    expect(result.current).toBe(form1);
  });
});

describe('useValue', () => {
  it('returns current value', () => {
    const initialValues = {name: 'test'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return useValue(form, 'name');
    });
    expect(result.current).toBe('test');
  });

  it('updates when value changes', () => {
    const initialValues = {name: 'test'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, value: useValue(form, 'name')};
    });
    expect(result.current.value).toBe('test');
    act(() => setValue(result.current.form, 'name', 'changed'));
    expect(result.current.value).toBe('changed');
  });
});

describe('useError', () => {
  it('returns current error', () => {
    const initialValues = {};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, error: useError(form, 'name')};
    });
    expect(result.current.error).toBeUndefined();
    act(() => setError(result.current.form, 'name', 'required'));
    expect(result.current.error).toBe('required');
  });
});

describe('useTouched', () => {
  it('returns touched state', () => {
    const initialValues = {};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, touched: useTouched(form, 'name')};
    });
    expect(result.current.touched).toBe(false);
    act(() => setTouched(result.current.form, 'name'));
    expect(result.current.touched).toBe(true);
  });
});

describe('useIsDirty', () => {
  it('returns false when no values changed', () => {
    const initialValues = {name: 'test'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, dirty: useIsDirty(form)};
    });
    expect(result.current.dirty).toBe(false);
  });

  it('returns true when a value changes and touched is triggered', () => {
    const initialValues = {name: 'test'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, dirty: useIsDirty(form)};
    });
    act(() => {
      setValue(result.current.form, 'name', 'changed');
      setTouched(result.current.form, 'name');
    });
    expect(result.current.dirty).toBe(true);
  });
});

describe('useHasErrors', () => {
  it('returns false when no errors', () => {
    const initialValues = {};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, hasErrors: useHasErrors(form)};
    });
    expect(result.current.hasErrors).toBe(false);
  });

  it('returns true when errors exist', () => {
    const initialValues = {};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, hasErrors: useHasErrors(form)};
    });
    act(() => setError(result.current.form, 'name', 'required'));
    expect(result.current.hasErrors).toBe(true);
  });
});
