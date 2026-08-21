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
  incrementSubmitCount,
  getValue,
  getValues,
  getError,
  getTouchedFields
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

  describe('values sync', () => {
    it('seeds external values on first render', () => {
      const {result} = renderHook(() => useForm({values: {name: 'a'}}));
      expect(getValue(result.current, 'name')).toBe('a');
    });

    it('syncs external values into the form when the reference changes', () => {
      const {result, rerender} = renderHook(({values}) => useForm({values}), {
        initialProps: {values: {name: 'a'}}
      });
      expect(getValue(result.current, 'name')).toBe('a');
      rerender({values: {name: 'b'}});
      expect(getValue(result.current, 'name')).toBe('b');
    });

    it('does not clobber user edits while the values reference is unchanged', () => {
      const values = {name: 'a'};
      const {result, rerender} = renderHook(({values}) => useForm({values}), {
        initialProps: {values}
      });
      act(() => setValue(result.current, 'name', 'user typed'));
      // Parent re-renders passing the same reference: the draft survives.
      rerender({values});
      expect(getValue(result.current, 'name')).toBe('user typed');
    });

    it('keeps touched flags when external values change', () => {
      const {result, rerender} = renderHook(({values}) => useForm({values}), {
        initialProps: {values: {name: 'a'}}
      });
      act(() => setTouched(result.current, 'name'));
      rerender({values: {name: 'b'}});
      expect(getTouchedFields(result.current)).toContain('name');
    });

    it('keeps errors when external values change', () => {
      const {result, rerender} = renderHook(({values}) => useForm({values}), {
        initialProps: {values: {name: 'a'}}
      });
      act(() => setError(result.current, 'name', 'required'));
      rerender({values: {name: 'b'}});
      expect(getError(result.current, 'name')?.message).toBe('required');
    });

    it('merges getValues with setInitialValues semantics after a sync', () => {
      const {result, rerender} = renderHook(({values}) => useForm({values}), {
        initialProps: {values: {name: 'a', nested: {x: 1}}}
      });
      act(() => setValue(result.current, 'name', 'draft'));
      rerender({values: {name: 'b', nested: {x: 1}}});
      // The uncommitted user edit is discarded and the merged tree equals
      // the new external object, exactly like setInitialValues.
      expect(getValues(result.current)).toEqual({name: 'b', nested: {x: 1}});
    });

    it('leaves initialValues untouched when no values option is given', () => {
      const initialValues = {name: 'init'};
      const {result, rerender} = renderHook(
        ({initialValues}) => useForm({initialValues}),
        {initialProps: {initialValues}}
      );
      rerender({initialValues});
      expect(getValue(result.current, 'name')).toBe('init');
    });
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

  it('flips to true on input without blur', () => {
    // Regression: useIsDirty used to subscribe to 'touched', so typing
    // without blurring never updated it.
    const initialValues = {name: 'test'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, dirty: useIsDirty(form)};
    });
    act(() => setValue(result.current.form, 'name', 'changed'));
    expect(result.current.dirty).toBe(true);
  });

  it('stays false when only touched changes', () => {
    const initialValues = {name: 'test'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, dirty: useIsDirty(form)};
    });
    act(() => setTouched(result.current.form, 'name'));
    expect(result.current.dirty).toBe(false);
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
    // getDirtyFields() memoizes its result object, so the reference stays
    // stable until the dirty set actually changes.
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
