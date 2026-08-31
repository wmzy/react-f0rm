import {describe, it, expect} from 'vitest';
import {renderHook, render, act} from '@testing-library/react';
import React from 'react';
import useForm, {
  useValue,
  useError,
  useFieldErrors,
  useTouched,
  useIsDirty,
  useDirtyFields,
  useTouchedFields,
  useHasErrors,
  useIsSubmitting,
  useCanSubmit,
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
  getTouchedFields,
  clearErrors,
  removeField,
  reset,
  handleSubmit
} from '../../src/form';
import {create as createEmitter, emit} from '@for-fun/event-emitter';
import {onKeyEvent, onPathEvent} from '../../src/subscribe';
import createPath from '../../src/path';

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
        wrapper: ({children}) => <React.StrictMode>{children}</React.StrictMode>
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

    it('does not clobber user edits on re-renders with an equal inline literal', () => {
      // Inline literals get a fresh object identity every render; without
      // the structural fallback in the controlled-values effect each
      // re-render would clear the values Map and revert the draft.
      const {result, rerender} = renderHook(({values}) => useForm({values}), {
        initialProps: {values: {name: 'a'}}
      });
      act(() => setValue(result.current, 'name', 'user typed'));
      rerender({values: {name: 'a'}}); // new reference, equal content
      expect(getValue(result.current, 'name')).toBe('user typed');
    });

    it('still re-syncs an inline literal when the content changed', () => {
      const {result, rerender} = renderHook(({values}) => useForm({values}), {
        initialProps: {values: {name: 'a'}}
      });
      act(() => setValue(result.current, 'name', 'user typed'));
      rerender({values: {name: 'a', extra: 1}}); // structural difference
      expect(getValue(result.current, 'name')).toBe('a');
      expect(getValue(result.current, 'extra')).toBe(1);
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

  it('does not re-render for sibling, lookalike-prefix or descendant writes', () => {
    // Leaf scope: useValueByPath only subscribes to writes at its own key,
    // so unrelated fields' changes never wake it up.
    const initialValues = {a: {b: 1, c: 2}, other: 'x'};
    let renders = 0;
    const {result} = renderHook(() => {
      renders++;
      const form = useForm({initialValues});
      return {form, value: useValue(form, 'a.b')};
    });
    const before = renders;
    act(() => setValue(result.current.form, 'a.c', 3)); // sibling
    act(() => setValue(result.current.form, 'a.bX', 3)); // prefix lookalike
    act(() => setValue(result.current.form, 'other', 'y')); // unrelated
    expect(renders).toBe(before);
    expect(result.current.value).toBe(1);
    // Sanity: the own write still re-renders exactly once.
    act(() => setValue(result.current.form, 'a.b', 9));
    expect(renders).toBe(before + 1);
    expect(result.current.value).toBe(9);
  });

  it('syncs on payload-less broadcasts (removeField and reset)', () => {
    // removeFieldByPath and reset emit 'change' without a path payload:
    // scoped subscribers must treat that as a full sync, not stay stuck.
    const initialValues = {name: 'init'};
    const {result} = renderHook(() => {
      const form = useForm({initialValues});
      return {form, value: useValue(form, 'name')};
    });
    act(() => setValue(result.current.form, 'name', 'draft'));
    expect(result.current.value).toBe('draft');
    act(() => removeField(result.current.form, 'name'));
    expect(result.current.value).toBeUndefined();
    act(() => reset(result.current.form, {name: 'fresh'}));
    expect(result.current.value).toBe('fresh');
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

  it('does not re-render when another field gets an error', () => {
    // Exact-key subscription: setErrorByPath emits 'errors' with its path,
    // so other fields' errors never wake this subscriber.
    let renders = 0;
    const {result} = renderHook(() => {
      renders++;
      const form = useForm({initialValues: {}});
      return {form, error: useError(form, 'name')};
    });
    const before = renders;
    act(() => setError(result.current.form, 'other', 'boom'));
    expect(renders).toBe(before);
    expect(result.current.error).toBeUndefined();
    // Sanity: the own error still lands.
    act(() => setError(result.current.form, 'name', 'required'));
    expect(renders).toBe(before + 1);
    expect(result.current.error).toBe('required');
  });

  it('clears on payload-less clearErrors broadcast', () => {
    const {result} = renderHook(() => {
      const form = useForm({initialValues: {}});
      return {form, error: useError(form, 'name')};
    });
    act(() => setError(result.current.form, 'name', 'required'));
    expect(result.current.error).toBe('required');
    // clearErrors emits 'errors' without a payload: full sync, no deadlock.
    act(() => clearErrors(result.current.form));
    expect(result.current.error).toBeUndefined();
  });

  it('clears on reset', () => {
    const {result} = renderHook(() => {
      const form = useForm({initialValues: {}});
      return {form, error: useError(form, 'name')};
    });
    act(() => setError(result.current.form, 'name', 'required'));
    expect(result.current.error).toBe('required');
    act(() => reset(result.current.form));
    expect(result.current.error).toBeUndefined();
  });
});

describe('useFieldErrors', () => {
  it('returns every error of the field and stays empty without one', () => {
    const {result} = renderHook(() => {
      const form = useForm({initialValues: {}});
      return {form, errors: useFieldErrors(form, 'name')};
    });
    expect(result.current.errors).toEqual([]);
    act(() => setError(result.current.form, 'name', ['required', 'too short']));
    expect(result.current.errors).toEqual([
      {type: 'custom', message: 'required'},
      {type: 'custom', message: 'too short'}
    ]);
    // clearErrors emits 'errors' without a payload: full sync.
    act(() => clearErrors(result.current.form));
    expect(result.current.errors).toEqual([]);
  });

  it('does not re-render when another field gets errors', () => {
    // Same exact-key subscription as useError: only this field's writes
    // wake the hook.
    let renders = 0;
    const {result} = renderHook(() => {
      renders++;
      const form = useForm({initialValues: {}});
      return {form, errors: useFieldErrors(form, 'name')};
    });
    const before = renders;
    act(() => setError(result.current.form, 'other', 'boom'));
    expect(renders).toBe(before);
    expect(result.current.errors).toEqual([]);
    act(() => setError(result.current.form, 'name', ['a', 'b']));
    expect(renders).toBe(before + 1);
    expect(result.current.errors.length).toBe(2);
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

  it('does not re-render when another field is touched', () => {
    // Exact-key subscription: setTouchedByPath emits 'touched' with its
    // path, so other fields' blurs never wake this subscriber.
    let renders = 0;
    const {result} = renderHook(() => {
      renders++;
      const form = useForm({initialValues: {}});
      return {form, touched: useTouched(form, 'name')};
    });
    const before = renders;
    act(() => setTouched(result.current.form, 'other'));
    expect(renders).toBe(before);
    expect(result.current.touched).toBe(false);
    // Sanity: the own touch still lands.
    act(() => setTouched(result.current.form, 'name'));
    expect(renders).toBe(before + 1);
    expect(result.current.touched).toBe(true);
  });

  it('clears on reset', () => {
    const {result} = renderHook(() => {
      const form = useForm({initialValues: {}});
      return {form, touched: useTouched(form, 'name')};
    });
    act(() => setTouched(result.current.form, 'name'));
    expect(result.current.touched).toBe(true);
    // reset emits 'touched' without a payload: full sync.
    act(() => reset(result.current.form));
    expect(result.current.touched).toBe(false);
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

describe('useCanSubmit', () => {
  // canSubmit = !isSubmitting && !hasErrors — the state-transition matrix
  // over errors × submitting. Every test starts from the (no errors, idle)
  // cell, then flips one or both inputs.
  function setup() {
    const {result} = renderHook(() => {
      const form = useForm({initialValues: {name: ''}});
      return {form, canSubmit: useCanSubmit(form)};
    });
    return result;
  }

  it('is true on a clean idle form', () => {
    const result = setup();
    expect(result.current.canSubmit).toBe(true);
  });

  it('flips false when an error lands and true again when it clears', () => {
    const result = setup();
    act(() => setError(result.current.form, 'name', 'required'));
    expect(result.current.canSubmit).toBe(false);
    act(() => clearErrors(result.current.form));
    expect(result.current.canSubmit).toBe(true);
  });

  it('flips false for the whole submitting span', () => {
    const result = setup();
    act(() => setIsSubmitting(result.current.form, true));
    expect(result.current.canSubmit).toBe(false);
    act(() => setIsSubmitting(result.current.form, false));
    expect(result.current.canSubmit).toBe(true);
  });

  it('recovers only once both inputs clear again', () => {
    const result = setup();
    // (errors, submitting) cell: both set
    act(() => setError(result.current.form, 'name', 'required'));
    act(() => setIsSubmitting(result.current.form, true));
    expect(result.current.canSubmit).toBe(false);
    // error clears while submitting: still blocked by isSubmitting
    act(() => clearErrors(result.current.form));
    expect(result.current.canSubmit).toBe(false);
    // error back before the submit ends: still blocked by hasErrors
    act(() => setError(result.current.form, 'name', 'required'));
    act(() => setIsSubmitting(result.current.form, false));
    expect(result.current.canSubmit).toBe(false);
    act(() => clearErrors(result.current.form));
    expect(result.current.canSubmit).toBe(true);
  });

  it('does not re-render when the inputs churn but the flag holds', () => {
    let renders = 0;
    const {result} = renderHook(() => {
      renders++;
      const form = useForm({initialValues: {a: ''}});
      return {form, canSubmit: useCanSubmit(form)};
    });
    act(() => setIsSubmitting(result.current.form, true));
    const afterFlip = renders;
    // An error landing cannot change the flag (already false): the wake
    // must recompute the snapshot without re-rendering the component.
    act(() => setError(result.current.form, 'a', 'x'));
    expect(renders).toBe(afterFlip);
    act(() => clearErrors(result.current.form));
    expect(renders).toBe(afterFlip);
    act(() => setIsSubmitting(result.current.form, false));
    expect(renders).toBe(afterFlip + 1);
    expect(result.current.canSubmit).toBe(true);
  });

  it('covers the full handleSubmit span: false while onSubmit is in flight', async () => {
    let releaseSubmit;
    let resolveEntered;
    const entered = new Promise(resolve => {
      resolveEntered = resolve;
    });
    const {result} = renderHook(() => {
      const form = useForm({initialValues: {a: ''}});
      return {form, canSubmit: useCanSubmit(form)};
    });
    const submit = handleSubmit(result.current.form, {
      onSubmit: () => {
        resolveEntered();
        return new Promise(resolve => {
          releaseSubmit = resolve;
        });
      }
    });
    let pending;
    // Drive the submit until its onSubmit callback is actually running —
    // isSubmitting spans validation plus the whole async onSubmit.
    await act(async () => {
      pending = submit();
      await entered;
    });
    expect(result.current.canSubmit).toBe(false);
    await act(async () => {
      releaseSubmit();
      await pending;
    });
    expect(result.current.canSubmit).toBe(true);
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

// Direct unit tests of the src/subscribe.ts primitives the scoped hooks are
// built on (useValueByPath/useFieldArray -> onPathEvent, useErrorByPath/
// useTouchedByPath -> onKeyEvent). Ancestor-write invalidation is only
// observable at this layer: getValueByPath reads ancestors through the
// initialValues fallback, so hook-level values do not move on ancestor
// writes. Placed in this file (not a new one) because the scoped hooks it
// exercises live in src/hooks/form.tsx.
describe('onPathEvent / onKeyEvent primitives', () => {
  it('leaf scope fires on own, ancestor and payload-less emits', () => {
    const emitter = createEmitter();
    const calls = [];
    const off = onPathEvent(emitter, 'change', createPath('a.b'), 'leaf', () =>
      calls.push('hit')
    );
    emit(emitter, 'change', createPath('a.b')); // own
    emit(emitter, 'change', createPath('a')); // ancestor
    emit(emitter, 'change'); // payload-less broadcast
    expect(calls).toHaveLength(3);
    off();
    emit(emitter, 'change', createPath('a.b'));
    expect(calls).toHaveLength(3); // unsubscribed stays silent
  });

  it('leaf scope stays silent for sibling, lookalike-prefix and descendant writes', () => {
    const emitter = createEmitter();
    let calls = 0;
    onPathEvent(emitter, 'change', createPath('a.b'), 'leaf', () => calls++);
    emit(emitter, 'change', createPath('a.c')); // sibling
    emit(emitter, 'change', createPath('a.bX')); // string-prefix lookalike
    emit(emitter, 'change', createPath('other')); // unrelated
    emit(emitter, 'change', createPath('a.b.c')); // descendant
    expect(calls).toBe(0);
  });

  it('branch scope additionally fires for descendant writes', () => {
    const emitter = createEmitter();
    let calls = 0;
    onPathEvent(emitter, 'change', createPath('tags'), 'branch', () => calls++);
    emit(emitter, 'change', createPath('tags')); // own
    emit(emitter, 'change', createPath('tags.0')); // direct child (array index)
    emit(emitter, 'change', createPath('tags.0.name')); // deep descendant
    emit(emitter, 'change', createPath('tagsX')); // prefix lookalike: silent
    expect(calls).toBe(3);
  });

  it('onKeyEvent fires only for the exact key and payload-less emits', () => {
    const emitter = createEmitter();
    let calls = 0;
    onKeyEvent(emitter, 'errors', createPath('name').key, () => calls++);
    emit(emitter, 'errors', createPath('name')); // exact
    emit(emitter, 'errors'); // payload-less broadcast
    emit(emitter, 'errors', createPath('nameX')); // lookalike
    emit(emitter, 'errors', createPath('other')); // unrelated
    expect(calls).toBe(2);
  });
});
