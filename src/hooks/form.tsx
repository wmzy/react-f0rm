import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useSyncExternalStore
} from 'react';
import {on} from '../emitter';
import type {EventEmitter} from '../emitter';
import {onKeyEvent, onPathEvent} from '../subscribe';
import type {SubscribeEvent, WatchScope} from '../subscribe';
import createForm, {
  FORM_ERROR,
  getErrorByPath,
  getErrorsRecord,
  getErrorsTree,
  getFieldErrorsByPath,
  getValueByPath,
  getValues,
  hasTouchedByPath,
  hasErrors,
  isDirty,
  isFieldDirtyByPath,
  getDirtyFields,
  getTouchedFields,
  setInitialValues,
  runFormValidate
} from '../form';
import type {
  FieldError,
  FieldErrors,
  FieldErrorsTree,
  Form,
  FormEvents,
  Options
} from '../form';
import type {FieldPath, PathValueOf} from '../types';
import createPath from '../path';
import type {PathSegments, Path} from '../path';
import {get, isEqual, isPromise} from '../util';

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
    // undefined = no baseline requested (createForm already defaulted to
    // {}): installing it would clear the values Map on mount for no
    // semantic gain — wiping any render-time useField initialValue seeds.
    // Async sources (Promise or thunk) are excluded too: createForm owns
    // their one-shot resolution, and a thunk's identity changes every
    // render, so re-seeding here would clobber the resolution cycle with
    // the raw function itself.
    if (initialValues === undefined) return;
    if (typeof initialValues === 'function' || isPromise(initialValues)) {
      return;
    }
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

  // Mount validation: the form-level `validate` runs once after mount when
  // the form opted into `validateOnMount` (field kicks are the fields' own
  // — useValidate schedules them per registration). Children's effects run
  // before the parent's, so field registrations are in place by the time
  // this fires. While an async initialValues source is pending, defer to
  // the 'loading' event — it fires after the resolved baseline has landed.
  // The run is fire-and-forget: a rejected validator is the submit path's
  // business, and a sync throw propagates exactly like trigger's.
  useEffect(() => {
    if (!form.validateOnMount || !form.validate) return;
    const run = () => {
      void runFormValidate(form).catch(() => undefined);
    };
    if (!form.isLoading) {
      run();
      return;
    }
    return on(form.emitter, 'loading', () => {
      run();
    });
  }, [form]);

  return form;
}

/** Per-hook snapshot cache for {@link useWatch}. */
type WatchCache<T> = {hasValue: boolean; value?: T};

/**
 * Shared core of {@link useWatch} and the path-scoped hooks: a
 * useSyncExternalStore binding over a custom event subscription.
 * `subscribeFactory` receives the invalidate callback (drop the snapshot
 * cache, then notify React) and returns its unsubscribe function, so the
 * core stays identical whether the subscription is global or scoped to
 * one path.
 *
 * The optional `isEqual` comparator redirects `invalidate`: instead of
 * dropping the cache and waking React unconditionally, an event first
 * recomputes the getter and asks `isEqual` whether anything observable
 * changed — an equal verdict keeps the cached snapshot and skips the
 * notify entirely (no render at all), an unequal one stores the fresh
 * snapshot and notifies. Omitted, the historical drop-and-notify pipeline
 * runs byte-for-byte unchanged.
 */
export function useWatchCore<T>(
  subscribeFactory: (invalidate: () => void) => () => void,
  getter: () => T,
  isEqual?: (prev: T, next: T) => boolean
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
  // Same freshness treatment for the comparator: invalidate is created once
  // per subscription, so it must read the latest isEqual through a ref
  // rather than capturing whichever instance the first render passed.
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

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
        const compare = isEqualRef.current;
        if (compare && cache.hasValue) {
          // Custom comparator: decide before waking React. Equal means the
          // fresh getter result is observably the same — keep the cached
          // reference and return without notifying, so React never even
          // schedules a render. Unequal stores the fresh snapshot up front,
          // so React's own post-notify Object.is check reads it without
          // recomputing the getter.
          const next = getterRef.current();
          if (compare(cache.value as T, next)) return;
          cache.value = next;
          notify();
          return;
        }
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
 *
 * The first argument is the form for the unified `fn(form, ...)` context
 * shape every hook shares; the raw emitter form remains accepted for
 * back-compat and for subscription sources that are not a full form.
 *
 * Framework-free counterpart: {@link watch} — the same event/getter/
 * `isEqual` contract exposed as a named export returning a
 * subscribe/getSnapshot handle any reactive runtime can bind to
 * (useWatch is its React binding; the ref-based cache here keeps inline
 * getters from re-subscribing per render).
 *
 * By default the re-render surface is the event's own scope: every emit
 * the subscription hears drops the snapshot cache and wakes React, which
 * then bails out when the recomputed snapshot is reference-identical
 * (Object.is) — the path/leaf scoping every built-in reader relies on.
 * The optional `isEqual` comparator exists for wide-scope getters that
 * return a fresh reference per call (a whole-values selector, say): each
 * event recomputes the getter and asks `isEqual` whether the result is
 * observably the same, and an equal verdict skips notifying React
 * altogether — no render, not even a bailed-out one. An unequal verdict
 * stores the new snapshot and re-renders. Same contract as TanStack's
 * `useSelector` compare. Omitted, behavior is unchanged.
 */
export function useWatch<T>(
  formOrEmitter: Form | EventEmitter<FormEvents>,
  event: SubscribeEvent,
  getter: () => T,
  isEqual?: (prev: T, next: T) => boolean
): T {
  // A form carries an `emitter` field the opaque emitter instance never
  // has, so the duck test cleanly discriminates the two accepted shapes.
  const emitter =
    'emitter' in formOrEmitter ? formOrEmitter.emitter : formOrEmitter;
  const subscribeFactory = useCallback(
    (invalidate: () => void) => on(emitter, event, invalidate),
    [emitter, event]
  );
  return useWatchCore(subscribeFactory, getter, isEqual);
}

/** Options for {@link useValue} and {@link useValueByPath}. */
export type UseValueOptions<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
> = {
  /** Value to return while the field reads undefined — react-hook-form's
   * `useWatch` `defaultValue`: an untouched, never-seeded field reads
   * this instead of `undefined`. */
  defaultValue?: PathValueOf<T, P>;
  /** Watch descendants too (react-hook-form's `exact: false`): a write
   * to `a.b` invalidates a `useValue(form, 'a')` read, and the read
   * resolves the merged subtree (the copy-on-write `getValues` tree) so
   * descendant edits show up in the result. Defaults to true — the leaf
   * scope, where only the exact key and its ancestors invalidate (the
   * long-standing behavior). */
  exact?: boolean;
};

/**
 * Get field value state
 */
export function useValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, options?: UseValueOptions<T, P>): PathValueOf<T, P> {
  return useValueByPath(form, createPath(name), options);
}

/**
 * Get field value state by path
 */
export function useValueByPath(
  form: Form,
  path: Path,
  options?: {defaultValue?: any; exact?: boolean}
): any {
  const {emitter} = form;
  const {key} = path;
  const scope: WatchScope = options?.exact === false ? 'branch' : 'leaf';
  // 'leaf' scope: a leaf read depends only on its own key and its
  // ancestors' (getValueByPath fallback chain), so writes elsewhere --
  // siblings, descendants, string-prefix lookalikes ('["a","bX"]') -- never
  // invalidate the snapshot. 'branch' (exact: false) additionally wakes on
  // descendant writes and resolves the merged subtree through `getValues`
  // (getValueByPath only walks live ancestors, so a descendant edit would
  // otherwise read back a stale reference). Payload-less broadcasts
  // (reset, setInitialValues) still sync everything; removeField matches
  // by path.
  const subscribeFactory = useCallback(
    (invalidate: () => void) =>
      onPathEvent(
        emitter,
        'change',
        createPath(JSON.parse(key) as PathSegments),
        scope,
        invalidate
      ),
    [emitter, key, scope]
  );
  return useWatchCore(subscribeFactory, () => {
    if (options?.exact === false) {
      return get(getValues(form), path.value);
    }
    const value = getValueByPath(form, path);
    return value === undefined ? options?.defaultValue : value;
  });
}

/**
 * Subscribe to the whole values tree: re-renders the calling component
 * whenever any 'change' event lands — react-hook-form's `watch()` with no
 * arguments. The snapshot is the memoized `getValues(form)` result, so
 * repeated reads during one render share one reference and, under
 * `__DEV__`, one frozen copy.
 *
 * Broad scope by design: read it in components that must stay cheap and
 * need the full tree; per-field readers should reach for {@link useValue}
 * instead so a keystroke re-renders exactly the affected field.
 */
export function useValues<T extends Record<string, any> = any>(
  form: Form<T>
): T {
  // Arrow wrapper, not getValues.bind: bind collapses the generic, so the
  // bound getter would type as () => Record<string, any> and lose the T.
  return useWatch<T>(form, 'change', () => getValues(form));
}

/**
 * Get field touched state
 */
export function useTouched<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
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
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
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
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
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
  return useWatch(form, 'change', isDirty.bind(null, form));
}

/**
 * Get whether one field is dirty: its live value exists and differs from
 * the field's effective baseline — the same per-field rule
 * `getFieldState(form, name).isDirty` applies (committed
 * `shouldDirty: false` baselines included). Subscribes to 'change' at
 * leaf scope like {@link useValue}: own-key and ancestor writes re-check
 * the flag, payload-less broadcasts (reset, setInitialValues) always
 * sync, and writes elsewhere never re-render it.
 */
export function useIsFieldDirty<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P): boolean {
  return useIsFieldDirtyByPath(form, createPath(name));
}

/**
 * Get whether one field is dirty, by parsed path. See {@link
 * useIsFieldDirty}.
 */
export function useIsFieldDirtyByPath(form: Form, path: Path): boolean {
  const {emitter} = form;
  const {key} = path;
  const subscribeFactory = useCallback(
    (invalidate: () => void) =>
      onPathEvent(
        emitter,
        'change',
        createPath(JSON.parse(key) as PathSegments),
        'leaf',
        invalidate
      ),
    [emitter, key]
  );
  return useWatchCore(subscribeFactory, () => isFieldDirtyByPath(form, path));
}

/**
 * Get dirty fields state -- object mapping each dirty field's user-facing
 * dotted path ('a.b', 'a.0.c') to true; recalculated after 'change' events
 */
export function useDirtyFields(form: Form): Record<string, boolean> {
  return useWatch(form, 'change', getDirtyFields.bind(null, form));
}

/**
 * Get touched fields state -- array of touched fields' user-facing dotted
 * paths ('a.b', 'a.0.c'); recalculated after 'touched' events
 */
export function useTouchedFields(form: Form): string[] {
  return useWatch(form, 'touched', getTouchedFields.bind(null, form));
}

/**
 * Aggregate snapshot of the whole form's state flags — the one-subscription
 * counterpart of react-hook-form's `formState` object (no errors object;
 * per-field error state stays with `useError`/`useFieldErrors`, and
 * `hasErrors`/`isValid` cover the whole-form questions).
 *
 * Recomputed on every state-bearing event; the field-wise comparator keeps
 * the returned reference stable while nothing observably changed, so
 * `useFormState(form).isDirty` re-renders no more often than the dedicated
 * {@link useIsDirty}. Cheaper than calling the granular hooks one by one
 * (one subscription and one snapshot instead of one per flag).
 */
export type FormState<T extends Record<string, any> = any> = {
  /** Any live value differs from its baseline (see {@link isDirty}). */
  isDirty: boolean;
  /** Dirty fields keyed by user-facing dotted path ('a.b', 'a.0.c'). */
  dirtyFields: Record<string, boolean>;
  /** At least one field is touched. */
  isTouched: boolean;
  /** Touched fields' user-facing dotted paths. */
  touchedFields: string[];
  /** Any error registered (field or form level). */
  hasErrors: boolean;
  /** No errors are registered — react-hook-form's `isValid` semantics.
   * In-flight validation is NOT factored in ({@link isValidating} is the
   * separate signal; async rounds temporarily pass this flag like RHF's). */
  isValid: boolean;
  /** Every error as one record keyed by user-facing dotted path
   * ('a.b', 'list.0') — react-hook-form's `formState.errors` shape,
   * typed as {@link FieldErrors} (per-key values optional). Memoized
   * (see {@link getErrorsRecord}): the reference is stable between error
   * writes, so the snapshot comparator can bail on it. */
  errors: FieldErrors<T>;
  isSubmitting: boolean;
  /**
   * Whether a submit has been attempted on this form — set on the first
   * `handleSubmit` call (validation outcome aside) and cleared by
   * `reset`, react-hook-form's `formState.isSubmitted` semantics. Read
   * after a failed submit to render a "fix the errors below" panel.
   */
  isSubmitted: boolean;
  /** Any validation round is running (field, form-level, or a pending
   * debounce window). */
  isValidating: boolean;
  isSubmitSuccessful: boolean | undefined;
  submitCount: number;
  /** Async initialValues still pending ({@link Form.isLoading}). */
  isLoading: boolean;
  /** The form-level disabled flag (fields OR their own `disabled`). */
  disabled: boolean;
};

/** Events any FormState field can react to: each recomputes the whole
 * snapshot — the comparator, not per-flag subscriptions, keeps the
 * re-render surface minimal. */
const FORM_STATE_EVENTS: readonly SubscribeEvent[] = [
  'change',
  'errors',
  'touched',
  'validating',
  'submitting',
  'submitCount',
  'submitSuccessful',
  'disabled',
  'loading'
];

function getFormState<T extends Record<string, any>>(
  form: Form<T>
): FormState<T> {
  return {
    isDirty: isDirty(form),
    dirtyFields: getDirtyFields(form),
    isTouched: form.touched.size > 0,
    touchedFields: getTouchedFields(form),
    hasErrors: hasErrors(form),
    isValid: !hasErrors(form),
    errors: getErrorsRecord(form),
    isSubmitting: form.isSubmitting,
    isSubmitted: form.isSubmitted,
    isValidating: form.validating.size > 0,
    isSubmitSuccessful: form.isSubmitSuccessful,
    submitCount: form.submitCount,
    isLoading: form.isLoading,
    disabled: form.disabled
  };
}

/** Field-wise equality: reference checks where the getter already memoizes
 * (dirtyFields), element-wise for the fresh array getTouchedFields builds,
 * value checks for the flags. */
function isSameFormState<T extends Record<string, any>>(
  a: FormState<T>,
  b: FormState<T>
): boolean {
  const sameTouched =
    a.touchedFields.length === b.touchedFields.length &&
    a.touchedFields.every((path, i) => path === b.touchedFields[i]);
  return (
    a.isDirty === b.isDirty &&
    a.dirtyFields === b.dirtyFields &&
    a.isTouched === b.isTouched &&
    sameTouched &&
    a.hasErrors === b.hasErrors &&
    a.isValid === b.isValid &&
    a.errors === b.errors &&
    a.isSubmitting === b.isSubmitting &&
    a.isSubmitted === b.isSubmitted &&
    a.isValidating === b.isValidating &&
    a.isSubmitSuccessful === b.isSubmitSuccessful &&
    a.submitCount === b.submitCount &&
    a.isLoading === b.isLoading &&
    a.disabled === b.disabled
  );
}

export function useFormState<T extends Record<string, any> = any>(
  form: Form<T>
): FormState<T> {
  const getter = useCallback(() => getFormState(form), [form]);
  const subscribeFactory = useCallback(
    (invalidate: () => void) => {
      const offs = FORM_STATE_EVENTS.map(event =>
        on(form.emitter, event, invalidate)
      );
      return () => {
        for (const off of offs) off();
      };
    },
    [form.emitter]
  );
  return useWatchCore(subscribeFactory, getter, isSameFormState);
}

/**
 * The official selector primitive — TanStack Form's
 * `useStore(store, selector)` counterpart. Subscribes to every
 * state-bearing form event and keeps `selector()`'s result as the
 * snapshot; the selector itself is a plain closure (read the form through
 * any getter — `getValue`, `getValues`, `form.errors.size`, …).
 *
 * Without `isEqual` the subscription is object-identity based: each event
 * recomputes the selector and React bails out when the result is
 * reference-identical (the contract every `useWatch` reader relies on).
 * The optional `isEqual(prev, next)` comparator is for wide-scope
 * selectors that return a fresh reference per call (a whole-values
 * projection, say): an equal verdict skips notifying React altogether —
 * no render, not even a bailed-out one (TanStack `useSelector` compare
 * contract).
 *
 * `useFormState` is the built-in aggregate selector; {@link useWatch} is
 * the single-event version. Reach for `useStore` when the projection is
 * yours and spans state events — e.g. `form.validating.size > 0 &&
 * form.isSubmitting` as one flag.
 */
export function useStore<T>(
  form: Form,
  selector: () => T,
  isEqual?: (prev: T, next: T) => boolean
): T {
  const subscribeFactory = useCallback(
    (invalidate: () => void) => {
      const offs = FORM_STATE_EVENTS.map(event =>
        on(form.emitter, event, invalidate)
      );
      return () => {
        for (const off of offs) off();
      };
    },
    [form.emitter]
  );
  return useWatchCore(subscribeFactory, selector, isEqual);
}

export function useHasErrors(form: Form): boolean {
  return useWatch(form, 'errors', hasErrors.bind(null, form));
}

/**
 * Get every error as one record keyed by user-facing dotted path
 * ('a.b', 'list.0') — react-hook-form's `formState.errors` shape, for
 * error-summary panels and a11y announcements. Values are the stored
 * FieldError[] arrays shared with the form (treat as read-only). The
 * record is memoized per form (see {@link getErrorsRecord}): the hook
 * re-renders only when an error write actually changed the record's
 * content.
 */
export function useErrors<T extends Record<string, any> = any>(
  form: Form<T>
): FieldErrors<T> {
  return useWatch(form, 'errors', () => getErrorsRecord(form));
}

/**
 * Get every error as one nested object following the values tree
 * (`errors.items?.[0]?.name` reads) — the typed optional-chaining
 * counterpart of {@link useErrors}' flat dotted record. Leaves hold the
 * stored FieldError[] arrays shared with the form (treat as read-only).
 * Memoized alongside the record (see {@link getErrorsTree}): the hook
 * re-renders only when an error write actually changed the tree's
 * content.
 */
export function useErrorsTree<T extends Record<string, any> = any>(
  form: Form<T>
): FieldErrorsTree<T> {
  return useWatch(form, 'errors', () => getErrorsTree(form));
}

/**
 * Get whether the form currently has no errors — react-hook-form's
 * `formState.isValid` counterpart. Subscribes to the `'errors'` event only;
 * in-flight validation does not flip it (see {@link useIsValidating}).
 */
export function useIsValid(form: Form): boolean {
  return useWatch(form, 'errors', () => !hasErrors(form));
}

export function useIsSubmitting(form: Form): boolean {
  return useWatch(form, 'submitting', () => form.isSubmitting);
}

/**
 * Get whether an async {@link Options.initialValues} source is still
 * pending — the flag a loading skeleton or a disabled submit button gates
 * on until the resolved baseline lands. Subscribes to the 'loading' event
 * the core emits around the resolution cycle.
 */
export function useIsLoading(form: Form): boolean {
  return useWatch(form, 'loading', () => form.isLoading);
}

/**
 * Get the form's user-owned metadata slot reactively (Formik's `status`
 * counterpart): any value the app stores through {@link setStatus} —
 * server session flags, wizard step state, non-field errors. Subscribes
 * to the payload-less 'status' event, so unrelated events never re-render
 * the caller, and the returned reference is stable between writes that
 * store an equal value (useSyncExternalStore's Object.is bailout).
 */
export function useStatus<T = any>(form: Form): T {
  return useWatch(form, 'status', () => form.status);
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
  return useWatch(form, 'submitCount', () => form.submitCount);
}

/**
 * Get whether any validation round is currently running: a field
 * validator's pending `validateDebounce` window, an async field validator
 * still in flight, or the form-level validate's debounce window / in-flight
 * round — every one of them holds a key in `form.validating`, and the
 * 'validating' events they emit (field rounds with a path payload, the
 * form-level round as a payload-less broadcast) are what this subscribes
 * to. The boolean snapshot is Object.is-stable, so churn among the marks
 * (a second field opening while the first settles) costs no render while
 * the flag holds. This is the flag a submit button disables itself on, or
 * spins a spinner with, through the pre-submit validation pass — it flips
 * true the moment the first round opens and back false when the last one
 * settles.
 */
export function useIsValidating(form: Form): boolean {
  return useWatch(form, 'validating', () => form.validating.size > 0);
}

/**
 * Get whether the last submit succeeded: `true` once a submit's validation
 * and `onSubmit` completed without throwing, `false` after a failed submit
 * (validation rejection or a thrown callback) and before any submit ran —
 * the falsy reading of the undefined initial/reset state. Subscribes to
 * the 'submitSuccessful' event the core's setSubmitSuccessful emits, so
 * the flag flips in the same tick the outcome lands: the usual consumers
 * are a success banner and a redirect-on-success effect.
 */
export function useIsSubmitSuccessful(form: Form): boolean {
  return useWatch(
    form.emitter,
    'submitSuccessful',
    () => !!form.isSubmitSuccessful
  );
}

/**
 * Get the form-level error message: the first error stored under the
 * reserved {@link FORM_ERROR} key, as display text — or undefined while
 * the slot is clean. That key is where a form-level `validate` record's
 * `_form` entry lands and where the Standard Schema adapter drops
 * path-less issues, so errors that belong to no single field still have a
 * reader. The classic usage renders it once above the submit button —
 * `useFormError(form) || null` — and the imperative twin is
 * `getError(form, FORM_ERROR)`.
 */
export function useFormError(form: Form): string | undefined {
  return useErrorByPath(form, createPath(FORM_ERROR))?.message;
}

/**
 * Get every form-level error: all errors stored under the reserved
 * {@link FORM_ERROR} key (insertion order), an empty array when the slot
 * is clean. The plural twin of {@link useFormError} for forms that stack
 * several form-level issues — each path-less Standard Schema issue lands
 * in this slot. The array reference is stable between unrelated events
 * (the stored array or a shared empty constant), so consumers can memo on
 * it; the imperative counterpart is `getFieldErrors(form, FORM_ERROR)`.
 */
export function useFormErrors(form: Form): FieldError[] {
  return useFieldErrorsByPath(form, createPath(FORM_ERROR));
}
