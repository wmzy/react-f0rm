import {describe, it, expect} from 'vitest';
import {renderHook, render, act} from '@testing-library/react';
import React from 'react';
import useForm, {
  useValue,
  useError,
  useTouched,
  useIsDirty,
  useDirtyFields,
  useTouchedFields,
  useHasErrors,
  useIsSubmitting,
  useSubmitCount
} from '../../src/hooks/form';
import createForm, {
  setValue,
  setError,
  setTouched,
  setIsSubmitting,
  incrementSubmitCount
} from '../../src/form';

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

  it('returns same instance across StrictMode double renders', () => {
    const initialValues = {name: 'test'};
    const {result, rerender} = renderHook(
      ({initialValues}) => useForm({initialValues}),
      {
        initialProps: {initialValues},
        wrapper: ({children}) => (
          <React.StrictMode>{children}</React.StrictMode>
        )
      }
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

  it('does not loop when setValue is called twice with the same value', () => {
    const initialValues = {name: 'test'};
    let renderCount = 0;
    const {result} = renderHook(() => {
      renderCount++;
      const form = useForm({initialValues});
      return {form, value: useValue(form, 'name')};
    });
    expect(result.current.value).toBe('test');
    act(() => {
      setValue(result.current.form, 'name', 'changed');
      setValue(result.current.form, 'name', 'changed');
    });
    expect(result.current.value).toBe('changed');
    // Completing the act and reading a bounded render count prove no
    // re-render loop (an uncached getSnapshot would spin forever).
    expect(renderCount).toBeLessThan(10);
  });

  it('does not miss a change emitted before the subscriber subscribes', () => {
    const form = createForm({initialValues: {name: 'test'}});
    // Sibling effects run in tree order: Mutator's setValue fires before
    // Subscriber's subscription effect attaches, so the 'change' event is
    // never delivered to it. The snapshot read at render time is stale.
    const Mutator = () => {
      React.useEffect(() => {
        setValue(form, 'name', 'changed');
      }, []);
      return null;
    };
    const Subscriber = () => useValue(form, 'name');
    const {container} = render(
      <div>
        <Mutator />
        <Subscriber />
      </div>
    );
    expect(container.textContent).toBe('changed');
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

  it('returns the message string for object errors', () => {
    const initialValues = {};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, error: useError(form, 'name')};
    });
    act(() =>
      setError(result.current.form, 'name', {type: 'min', message: 'too short'})
    );
    expect(result.current.error).toBe('too short');
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

describe('useDirtyFields', () => {
  it('returns empty object when no values changed', () => {
    const initialValues = {a: '1', b: '2'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, dirtyFields: useDirtyFields(form)};
    });
    expect(result.current.dirtyFields).toEqual({});
  });

  it('contains only changed fields after change events', () => {
    const initialValues = {a: '1', b: '2'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, dirtyFields: useDirtyFields(form)};
    });
    act(() => setValue(result.current.form, 'a', 'changed'));
    expect(result.current.dirtyFields).toEqual({a: true});
  });

  it('returns a stable reference between change events', () => {
    const initialValues = {a: '1'};
    const {result, rerender} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, dirtyFields: useDirtyFields(form)};
    });
    const first = result.current.dirtyFields;
    rerender();
    rerender();
    // getDirtyFields() builds a fresh object per call: useWatch must cache
    // it between events or useSyncExternalStore loops.
    expect(result.current.dirtyFields).toBe(first);
    act(() => setValue(result.current.form, 'a', '2'));
    expect(result.current.dirtyFields).toEqual({a: true});
    expect(result.current.dirtyFields).not.toBe(first);
  });
});

describe('useTouchedFields', () => {
  it('returns empty array initially', () => {
    const initialValues = {};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, touchedFields: useTouchedFields(form)};
    });
    expect(result.current.touchedFields).toEqual([]);
  });

  it('contains field after blur', () => {
    const initialValues = {};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, touchedFields: useTouchedFields(form)};
    });
    act(() => setTouched(result.current.form, 'a'));
    expect(result.current.touchedFields).toContain('a');
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

describe('useIsSubmitting', () => {
  it('returns false initially', () => {
    const initialValues = {name: 'test'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, isSubmitting: useIsSubmitting(form)};
    });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('returns true when submitting', () => {
    const initialValues = {name: 'test'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, isSubmitting: useIsSubmitting(form)};
    });
    act(() => setIsSubmitting(result.current.form, true));
    expect(result.current.isSubmitting).toBe(true);
  });

  it('returns false after submission ends', () => {
    const initialValues = {name: 'test'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, isSubmitting: useIsSubmitting(form)};
    });
    act(() => setIsSubmitting(result.current.form, true));
    expect(result.current.isSubmitting).toBe(true);
    act(() => setIsSubmitting(result.current.form, false));
    expect(result.current.isSubmitting).toBe(false);
  });
});

describe('useSubmitCount', () => {
  it('returns 0 initially', () => {
    const initialValues = {name: 'test'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, submitCount: useSubmitCount(form)};
    });
    expect(result.current.submitCount).toBe(0);
  });

  it('increments when submit count changes', () => {
    const initialValues = {name: 'test'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, submitCount: useSubmitCount(form)};
    });
    act(() => incrementSubmitCount(result.current.form));
    expect(result.current.submitCount).toBe(1);
    act(() => incrementSubmitCount(result.current.form));
    expect(result.current.submitCount).toBe(2);
  });
});
