import {useState, useEffect, useCallback, useRef} from 'react';
import {useSyncExternalStore} from 'use-sync-external-store/shim';
import {on} from '@for-fun/event-emitter';
import type {EventEmitter} from '@for-fun/event-emitter';
import createForm, {
  getErrorByPath,
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

export default function useForm<T extends Record<string, any> = any>(
  options?: Options<T>
): Form<T> {
  // Lazy initialization: createForm runs once per mount and the returned
  // instance is stable across re-renders (and StrictMode double renders),
  // without writing to refs during render.
  const [form] = useState(() => createForm<T>(options));
  const initialValues = options && options.initialValues;

  useEffect(() => {
    setInitialValues(form, initialValues);
  }, [form, initialValues]);

  return form;
}

/** Per-hook snapshot cache for {@link useWatch}. */
interface WatchCache<T> {
  hasValue: boolean;
  value?: T;
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
      return on(emitter, event, invalidate);
    },
    [emitter, event, cache]
  );

  // getServerSnapshot is deliberately omitted: this is a client-only library.
  return useSyncExternalStore(subscribe, getSnapshot);
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
  return useWatch(
    form.emitter,
    'change',
    getValueByPath.bind(null, form, path)
  );
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
  return useWatch(
    form.emitter,
    'touched',
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
  return useWatch(
    form.emitter,
    'errors',
    getErrorByPath.bind(null, form, path)
  );
}

export function useIsDirty(form: Form): boolean {
  return useWatch(form.emitter, 'touched', isDirty.bind(null, form));
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

export function useSubmitCount(form: Form): number {
  return useWatch(form.emitter, 'submitCount', () => form.submitCount);
}
