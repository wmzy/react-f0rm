import {useState, useEffect, useCallback, useRef} from 'react';
import {useSyncExternalStore} from 'use-sync-external-store/shim';
import {on} from '@for-fun/event-emitter';
import type {EventEmitter} from '@for-fun/event-emitter';
import {onKeyEvent, onPathEvent} from '../subscribe';
import createForm, {
  getErrorByPath,
  getFieldErrorsByPath,
  getValueByPath,
  hasTouchedByPath,
  hasErrors,
  isDirty,
  getDirtyFields,
  getTouchedFields,
  setInitialValues
} from '../form';
import type {FieldError, Form, Options, Name} from '../form';
import type {FieldPath, PathValueOf} from '../types';
import createPath from '../path';
import type {Path} from '../path';
import {isEqual} from '../util';

/**
 * Create a form instance bound to this component.
 *
 * Beyond {@link Options}, the optional `values` object enables controlled
 * usage: when it genuinely changes it is re-synced into the form with
 * setInitialValues semantics -- uncommitted user edits are discarded
 * (master-detail semantics: selecting another record replaces the draft),
 * while touched flags and errors survive. Change detection is
 * reference-first with a structural fallback, so re-renders that pass an
 * inline literal with equal content never re-sync -- the user's
 * in-progress typing is never clobbered.
 */
export default function useForm<T extends Record<string, any> = any>(
  options?: Options<T> & {values?: T}
): Form<T> {
  // Lazy initialization: createForm runs once per mount and the returned
  // instance is stable across re-renders (and StrictMode double renders),
  // without writing to refs during render. A provided `values` object is
  // seeded synchronously here (createForm does the same for initialValues)
  // so the first paint and SSR already reflect the controlled values.
  const [form] = useState(() => {
    const created = createForm<T>(options);
    if (options && options.values !== undefined) {
      setInitialValues(created, options.values);
    }
    return created;
  });
  const initialValues = options && options.initialValues;
  const values = options && options.values;

  // Track which initialValues source object the form was last seeded from.
  // Inline options create a fresh object every render, and re-seeding
  // clears the values Map (setInitialValues semantics), which would revert
  // every committed edit right after each re-render -- on the client and
  // after hydration alike. Memoized callers are covered by the reference
  // check; inline literals by the structural one, so only genuinely new
  // content re-seeds.
  const seededRef = useRef<{done: boolean; source: any} | null>(null);
  if (seededRef.current === null)
    seededRef.current = {done: false, source: undefined};

  useEffect(() => {
    const seeded = seededRef.current!;
    if (
      seeded.done &&
      (seeded.source === initialValues || isEqual(seeded.source, initialValues))
    ) {
      return;
    }
    seeded.done = true;
    seeded.source = initialValues;
    setInitialValues(form, initialValues);
  }, [form, initialValues]);

  // Controlled values: re-sync only when the incoming object genuinely
  // differs from what the form was last seeded from. The reference check
  // is the fast path (memoized callers); inline literals get a fresh
  // object identity every render, so without the structural comparison
  // each re-render would clear the values Map (setInitialValues
  // semantics) and revert the user's uncommitted edits -- same hazard the
  // initialValues seed guard above protects against. Master-detail
  // semantics still apply whenever the content actually changed.
  const controlledRef = useRef<{done: boolean; source: any} | null>(null);
  if (controlledRef.current === null) {
    controlledRef.current = {done: false, source: undefined};
  }

  useEffect(() => {
    if (values === undefined) return;
    const seeded = controlledRef.current!;
    if (
      seeded.done &&
      (seeded.source === values || isEqual(seeded.source, values))
    ) {
      return;
    }
    seeded.done = true;
    seeded.source = values;
    setInitialValues(form, values);
  }, [form, values]);

  return form;
}

/** Per-hook snapshot cache for {@link useWatch}. */
interface WatchCache<T> {
  hasValue: boolean;
  value?: T;
}

/**
 * Shared core of {@link useWatch} and the path-scoped hooks: a
 * useSyncExternalStore binding over a custom event subscription.
 * `subscribeFactory` receives the invalidate callback (drop the snapshot
 * cache, then notify React) and returns its unsubscribe function, so the
 * core stays identical whether the subscription is global or scoped to
 * one path.
 */
function useWatchCore<T>(
  subscribeFactory: (invalidate: () => void) => () => void,
  getter: () => T
): T {
  // useSyncExternalStore requires getSnapshot to return the same reference
  // until the store actually changed, otherwise React warns and loops.
  // Cache the snapshot per hook instance and recompute it only on the first
  // read and after the watched event fired.
  const cacheRef = useRef<WatchCache<T> | null>(null);
  if (cacheRef.current === null) cacheRef.current = {hasValue: false};
  const cache = cacheRef.current;

  // Hold the latest getter in a ref so getSnapshot keeps a stable identity
  // (callers pass a freshly bound function on every render) while still
  // recomputing with the most recent getter when the cache is invalid.
  const getterRef = useRef(getter);
  getterRef.current = getter;

  const getSnapshot = useCallback(() => {
    if (!cache.hasValue) {
      cache.value = getterRef.current();
      cache.hasValue = true;
    }
    return cache.value as T;
  }, [cache]);

  const subscribe = useCallback(
    (notify: () => void) => {
      // The form may have changed between render and this subscription, and
      // those events were missed: drop the cache. React's consistency check
      // right after subscribing recomputes and re-renders only when the
      // fresh value differs from the committed snapshot.
      cache.hasValue = false;
      const invalidate = () => {
        cache.hasValue = false;
        notify();
      };
      return subscribeFactory(invalidate);
    },
    [subscribeFactory, cache]
  );

  // Form state lives entirely in synchronously readable Map/Set structures
  // seeded from initialValues/values during the lazy useState initializer,
  // so the server snapshot is computed exactly like the client's first
  // render -- pass getSnapshot itself as getServerSnapshot and hydration
  // matches.
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Subscribe to a form event and keep the component's snapshot of `getter()`
 * in sync with the form state.
 *
 * Built on useSyncExternalStore, so snapshots taken while React renders are
 * guaranteed consistent (no tearing under concurrent rendering) and changes
 * emitted before the subscription effect runs are still picked up.
 */
export function useWatch<T>(
  emitter: EventEmitter,
  event: string,
  getter: () => T
): T {
  const subscribeFactory = useCallback(
    (invalidate: () => void) => on(emitter, event, invalidate),
    [emitter, event]
  );
  return useWatchCore(subscribeFactory, getter);
}

/**
 * Get field value state
 */
export function useValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | Name = Name
>(form: Form<T>, name: P): PathValueOf<T, P> {
  return useValueByPath(form, createPath(name));
}

/**
 * Get field value state by path
 */
export function useValueByPath(form: Form, path: Path): any {
  const {emitter} = form;
  const {key} = path;
  // 'leaf' scope: a leaf read depends only on its own key and its
  // ancestors' (getValueByPath fallback chain), so writes elsewhere --
  // siblings, descendants, string-prefix lookalikes ('["a","bX"]') -- never
  // invalidate the snapshot. Payload-less broadcasts (reset, removeField,
  // setInitialValues) still sync everything.
  const subscribeFactory = useCallback(
    (invalidate: () => void) =>
      onPathEvent(emitter, 'change', path, 'leaf', invalidate),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are `key` on purpose: useValue creates a fresh Path per render, so the object must stay out of the deps while the key string pins the subscription
    [emitter, key]
  );
  return useWatchCore(subscribeFactory, getValueByPath.bind(null, form, path));
}

/**
 * Get field touched state
 */
export function useTouched<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | Name = Name
>(form: Form<T>, name: P): boolean {
  return useTouchedByPath(form, createPath(name));
}

/**
 * Get field touched state by path
 */
export function useTouchedByPath(form: Form, path: Path): boolean {
  const {emitter} = form;
  const {key} = path;
  // Touched is stored per exact key, so only this field's own setTouched
  // (now emitted with its path) matters; payload-less broadcasts (reset,
  // removeField) still sync everything.
  const subscribeFactory = useCallback(
    (invalidate: () => void) => onKeyEvent(emitter, 'touched', key, invalidate),
    [emitter, key]
  );
  return useWatchCore(
    subscribeFactory,
    hasTouchedByPath.bind(null, form, path)
  );
}

/**
 * Get field error message state
 * @return current error's message string (display text), or undefined
 */
export function useError<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | Name = Name
>(form: Form<T>, name: P): string | undefined {
  return useErrorByPath(form, createPath(name))?.message;
}

/**
 * Get field error state by path
 * @return current FieldError object ({type, message}), or undefined
 */
export function useErrorByPath(form: Form, path: Path): FieldError | undefined {
  const {emitter} = form;
  const {key} = path;
  // Errors are stored per exact key, so only writes to this field's error
  // (setErrorByPath now emits with its path) matter; payload-less
  // broadcasts (clearErrors, reset, removeField) still sync everything.
  const subscribeFactory = useCallback(
    (invalidate: () => void) => onKeyEvent(emitter, 'errors', key, invalidate),
    [emitter, key]
  );
  return useWatchCore(subscribeFactory, getErrorByPath.bind(null, form, path));
}

/**
 * Get all field errors
 * @return every error registered for the field (insertion order); an empty
 *         array when the field has none
 */
export function useFieldErrors<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | Name = Name
>(form: Form<T>, name: P): FieldError[] {
  return useFieldErrorsByPath(form, createPath(name));
}

/**
 * Get all field errors by path
 * @return every error registered for the field (insertion order); an empty
 *         array when the field has none
 */
export function useFieldErrorsByPath(form: Form, path: Path): FieldError[] {
  const {emitter} = form;
  const {key} = path;
  // Same exact-key subscription and snapshot rules as useErrorByPath: the
  // getter returns the shared empty constant when clean and the stored
  // array by reference otherwise, so the useSyncExternalStore snapshot is
  // reference-stable between unrelated events.
  const subscribeFactory = useCallback(
    (invalidate: () => void) => onKeyEvent(emitter, 'errors', key, invalidate),
    [emitter, key]
  );
  return useWatchCore(
    subscribeFactory,
    getFieldErrorsByPath.bind(null, form, path)
  );
}

export function useIsDirty(form: Form): boolean {
  // Dirty state is driven by value changes, not touch state: subscribe to
  // 'change' so typing flips this immediately, even before a blur.
  return useWatch(form.emitter, 'change', isDirty.bind(null, form));
}

/**
 * Get dirty fields state -- object mapping each dirty field's user-facing
 * dotted path ('a.b', 'a.0.c') to true; recalculated after 'change' events
 */
export function useDirtyFields(form: Form): Record<string, boolean> {
  return useWatch(form.emitter, 'change', getDirtyFields.bind(null, form));
}

/**
 * Get touched fields state -- array of touched fields' user-facing dotted
 * paths ('a.b', 'a.0.c'); recalculated after 'touched' events
 */
export function useTouchedFields(form: Form): string[] {
  return useWatch(form.emitter, 'touched', getTouchedFields.bind(null, form));
}

export function useHasErrors(form: Form): boolean {
  return useWatch(form.emitter, 'errors', hasErrors.bind(null, form));
}

export function useIsSubmitting(form: Form): boolean {
  return useWatch(form.emitter, 'submitting', () => form.isSubmitting);
}

/**
 * Get whether the form accepts a submit right now:
 * `!isSubmitting && !hasErrors`. This is the single flag a submit
 * button's `disabled` prop wants — it is `false` for the whole async
 * `onSubmit` span (not just the validation pass) and whenever any field
 * holds an error (client validation or server backfill), replacing the
 * hand-rolled `useHasErrors(form) || useIsSubmitting(form)` pair.
 * Deliberately no dirty or validating semantics: an untouched-but-clean
 * form can submit.
 */
export function useCanSubmit(form: Form): boolean {
  const {emitter} = form;
  // canSubmit folds two events into one boolean: error writes
  // ('errors') and submit-state flips ('submitting'). useWatch subscribes
  // to a single event, so subscribe to both through useWatchCore — the
  // snapshot recomputes on either wake and re-renders only when the
  // boolean itself flips, so unrelated single-field error churn costs no
  // extra render (the same granularity useHasErrors already has).
  const subscribeFactory = useCallback(
    (invalidate: () => void) => {
      const offErrors = on(emitter, 'errors', invalidate);
      const offSubmitting = on(emitter, 'submitting', invalidate);
      return () => {
        offErrors();
        offSubmitting();
      };
    },
    [emitter]
  );
  return useWatchCore(
    subscribeFactory,
    () => !form.isSubmitting && !hasErrors(form)
  );
}

export function useSubmitCount(form: Form): number {
  return useWatch(form.emitter, 'submitCount', () => form.submitCount);
}
