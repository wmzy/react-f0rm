import {
  create as createEmitter,
  emit,
  setMaxListeners
} from '@for-fun/event-emitter';
import type {EventEmitter} from '@for-fun/event-emitter';
import createPath from './path';
import type {Name, Path} from './path';
import type {FieldPath} from './types';
import {isPromise} from './util';
import {setInitialValues} from './core/values';
import type {SetFocusOptions} from './core/focus';
import type {VALIDATION_OUTCOME} from './core/errors';

// The implementation is split by concern under ./core (values, errors,
// touched, dirty, validate, change, submit, focus; module-private shared
// state lives in ./core/internals, which is deliberately not re-exported).
// This file keeps the public types and the create factory, and re-exports
// every public function — the single import surface the rest of the
// package (hooks, components, server, persist, resolvers) consumes.
export type {Name};
export type {FieldPath, PathValue} from './types';

/** Dev-only flag, replaced at build time (rollup.config.js `replace`);
 * defined for the test environment in vitest.config.ts. */
declare const __DEV__: boolean;

/** A field error: `type` identifies the error kind ('custom' for plain
 * string errors), `message` is the display text. */
export type FieldError = {type: string; message: string};

/** A flattened entry from {@link getErrors}. */
export type FieldErrorEntry = {path: string; type: string; message: string};

/** When a field is validated:
 * - `'onSubmit'` (default): only on submit
 * - `'onBlur'`: when the field loses focus
 * - `'onChange'`: on every change
 * - `'onTouched'`: on first blur, then on every change
 * - `'all'`: on both change and blur
 */
export type ValidationMode =
  'onSubmit' | 'onBlur' | 'onChange' | 'onTouched' | 'all';

/** When a field is re-validated after it already has an error:
 * - `'onChange'` (default): on every change
 * - `'onBlur'`: when the field loses focus
 * - `'onSubmit'`: only on submit (no live re-validation)
 */
export type ReValidateMode = 'onChange' | 'onBlur' | 'onSubmit';

/** Structured form-level validate result: `errors` uses the same nested
 * shape a plain error record uses, `values` is the schema's parsed output
 * (coerce/transform results included). Either side may be omitted.
 *
 * The brand constant itself lives in the errors module (the leaf module of
 * the core dependency graph — every consumer imports it from there) and is
 * re-exported below with `export *`. */
export type ValidationOutcome<T> = {
  [VALIDATION_OUTCOME]: true;
  errors?: Record<string, any>;
  values?: T;
};

/** What a form-level validate function may return: a plain nested error
 * record (flattened into field errors — the long-standing shape), or a
 * branded {@link ValidationOutcome} whose `values` become the form's
 * parsedValues baseline. */
export type ValidateResult<T> =
  | Record<string, any>
  | ValidationOutcome<T>
  | Promise<Record<string, any> | ValidationOutcome<T>>;

/** Context passed to a form-level `validate` function's second argument.
 * `signal` aborts as soon as the round is superseded — a newer round
 * started (which only happens under a positive `validateDebounce`, where
 * kicks merge into windows) — so async validators can cancel their
 * underlying work instead of racing a stale result home. Stale results
 * are dropped independently by the round gate, so validators that ignore
 * the signal stay correct too; the same contract field-level validators
 * get through their own `meta`. */
export type FormValidateMeta<T extends Record<string, any> = any> = {
  form: Form<T>;
  signal: AbortSignal;
};

/** Form-level validator: receives all values (plus {@link
 * FormValidateMeta} as an optional second argument) and returns a
 * {@link ValidateResult} — sync or async — or `undefined`/nothing when
 * valid (the runtime skips falsy results, so implicit-return callbacks
 * type-check). */
export type FormValidateFn<T extends Record<string, any> = any> = (
  values: T,
  meta: FormValidateMeta<T>
) => ValidateResult<T> | undefined;

/**
 * The emitter event table for {@link Form.emitter}: each event's payload
 * tuple. Path-carrying events declare an optional single `Path` payload —
 * emit sites send it for single-field mutations and omit it for bulk
 * payload-less broadcasts (reset, setInitialValues, clear-all), both of
 * which subscribers handle. `focusError` carries the target's path key
 * plus optional {@link SetFocusOptions}.
 */
export type FormEvents =
  | ['change', [path?: Path]]
  | ['errors', [path?: Path]]
  | ['touched', [path?: Path]]
  | ['validating', [path?: Path]]
  | ['submitting', []]
  | ['submitCount', []]
  | ['submitSuccessful', []]
  | ['reset', []]
  | ['disabled', []]
  | ['loading', []]
  | ['focusError', [key: string, options?: SetFocusOptions]];

export type Form<T extends Record<string, any> = any> = {
  emitter: EventEmitter<FormEvents>;
  mode: ValidationMode;
  reValidateMode: ReValidateMode;
  initialValues: T;
  values: Map<string, any>;
  /** Tombstones of unregistered field paths (JSON path keys): reading or
   * merging values must not fall back to initialValues for these paths. */
  deleted: Set<string>;
  /** Every error registered for a field, as a non-empty array (the
   * write-side {@link setErrorByPath} normalizes to this invariant, so
   * readers never need to guard against an empty list). Readers wanting
   * the display error take the first entry ({@link getError}); readers
   * wanting all of them use {@link getFieldErrors}. */
  errors: Map<string, FieldError[]>;
  touched: Set<string>;
  /** Per-field validation kicks, registered by {@link
   * registerValidatorByPath} (`useValidate` is the React-side
   * registration): each is the field's debounce/lock-aware kick —
   * invoking it validates the field's current value. `trigger` /
   * `ensureValidate` run every entry; the user-change gate ({@link
   * userChangeByPath}) runs the entry at the changed path. */
  validators: Map<string, () => void>;
  validating: Set<string>;
  /** Parsed values from the last successful schema validation: the
   * schema's complete output tree (coerced/transformed values included).
   * Sits between initialValues and the values Map in {@link getValues}
   * until `reset`/`setInitialValues` clears it. Never affects dirty
   * state — that compares live edits against initialValues only. */
  parsedValues: T | undefined;
  /** Form-level validator, seeded from {@link Options.validate}. May
   * receive a second {@link FormValidateMeta} argument. */
  validate?: FormValidateFn<T>;
  /** Delay in milliseconds before the form-level `validate` runs; seeded
   * from {@link Options.validateDebounce} and fixed at create time. */
  validateDebounce?: number;
  /** Path keys (JSON-stringified segments) of the fields whose user
   * changes re-run the form-level `validate`; normalized from {@link
   * Options.validateDeps} at create time and fixed thereafter. */
  validateDeps?: ReadonlySet<string>;
  isSubmitting: boolean;
  submitCount: number;
  isSubmitSuccessful: boolean | undefined;
  /** True while an async {@link Options.initialValues} source (a Promise,
   * or a thunk returning one) is still pending — the form starts empty
   * and the resolved values become the baseline via setInitialValues when
   * it lands. Flips through the payload-less 'loading' event
   * (`useIsLoading` / `useFormState().isLoading`). */
  isLoading: boolean;
  /** Form-level default for a bound field's unmount behavior, seeded from
   * {@link Options.shouldUnregister}: `true` (the default) tombstones an
   * unmounted field, `false` keeps its value (react-hook-form's
   * `shouldUnregister` semantics). A field's own `shouldUnregister` option
   * overrides this. */
  shouldUnregister?: boolean;
  /** Form-level disabled flag, OR-ed into every bound field's `disabled`
   * (form flag || the field's own option). Seeded from
   * {@link Options}.disabled at create time and toggled at runtime with
   * {@link setDisabled}, which emits a payload-less 'disabled' event so
   * subscribed fields re-render. */
  disabled: boolean;
};

export type Options<T extends Record<string, any> = any> = {
  /**
   * The values baseline. Sync objects seed immediately (SSR renders
   * them). Async sources — a Promise, or a thunk returning a value or
   * Promise (react-hook-form's async `defaultValues` shape) — start the
   * form empty with `isLoading: true` and land the resolved values as
   * the baseline via setInitialValues once they resolve: value
   * subscribers re-sync, dirty/touched state starts clean, and a later
   * `reset()` returns to the resolved baseline. A rejected source flips
   * isLoading back to false, keeps the form empty, and logs the error in
   * DEV — attach a `.catch` on the source itself to handle it. The thunk
   * runs at create time: keep its identity stable (module scope or
   * useMemo) when passing it inline, and note StrictMode double-invokes
   * it in development, like every render-phase call.
   */
  initialValues?: T | Promise<T> | (() => T | Promise<T>);
  /** When fields are validated. Defaults to `'onSubmit'`. See
   * {@link ValidationMode}. */
  mode?: ValidationMode;
  /** When a field is re-validated after it already has an error — it only
   * takes effect once the field has an error. Defaults to `'onChange'`. See
   * {@link ReValidateMode}. */
  reValidateMode?: ReValidateMode;
  /**
   * Form-level validator. Returns a record of errors keyed by field path;
   * nested objects are flattened ('a.b' style) and array values contribute
   * every non-empty string they hold as separate errors (zod `flatten()`
   * formErrors style). Schema adapters instead return a branded
   * {@link ValidationOutcome}: `errors` flattens the same way, `values`
   * (the schema's parsed output) becomes the form's parsedValues baseline
   * that {@link getValues} layers over initialValues.
   */
  validate?: FormValidateFn<T>;
  /**
   * Milliseconds to debounce the form-level `validate`: kicks from
   * `trigger`/`ensureValidate`/submit inside the window merge into one
   * run, and while the timer is pending the form counts as validating,
   * so `trigger` and submit wait the window out — the same contract the
   * per-field `validateDebounce` gives field validators. The merged run
   * reads the values current when its timer fires. Defaults to `0`
   * (validate runs immediately, exactly as before this option existed).
   */
  validateDebounce?: number;
  /** Fields whose user changes re-run the form-level `validate` — the
   * cross-field dependency list (password-confirm mismatch and friends).
   * Each entry is a field path ('password', 'user.email', 'items.0.qty');
   * a user change to a listed field re-runs the form-level `validate`
   * under the same mode/`reValidateMode` gating the field's own
   * validator gets. Omit it and the form-level `validate` only runs on
   * `trigger`/submit, exactly as before this option existed.
   *
   * Opting in also changes what a re-run may clear: each round first
   * drops the errors the previous round wrote (paths it flattened onto),
   * so a dep change that fixes the cross-field error makes it disappear.
   * Errors the round never wrote — field validators', `setServerErrors`,
   * manual `setError` — are never touched. TanStack Form's counterpart is
   * `onChangeListenTo` (v1) / validator `triggers` (v2 alpha). */
  validateDeps?: FieldPath<T>[];
  /**
   * Form-level default for a bound field's unmount behavior. `true` (the
   * default) tombstones an unmounted field — it drops out of
   * `getValues()` instead of reviving its initial value (this library's
   * historical default); `false` keeps the value, matching
   * react-hook-form's `shouldUnregister`. A field's own
   * `useField({shouldUnregister})` option overrides the form-level flag
   * in either direction.
   */
  shouldUnregister?: boolean;
  /** Start the form with every bound field disabled — the flag bound
   * fields OR with their own `disabled` option (a field cannot opt out
   * of a disabled form). Toggle later with {@link setDisabled}.
   * Defaults to `false`. */
  disabled?: boolean;
};

/**
 * Create form instance
 * @param options
 * @return form instance
 */
export default function create<T extends Record<string, any> = any>(
  options?: Options<T>
): Form<T> {
  const emitter = createEmitter<FormEvents>();
  // A form legitimately accumulates one listener per mounted field per
  // event (useField subscribes change/errors/disabled/focusError…), so
  // the emitter's default max-listener warning would fire in DEV for any
  // form over ~10 fields. Field subscriptions are removed on unmount —
  // there is nothing to leak — so the warning would only be noise: raise
  // the cap to unlimited for form emitters.
  setMaxListeners(emitter, 0);
  // Async initialValues: a thunk is invoked here (create-time, like every
  // other option resolution); a promise-typed result starts the loading
  // cycle below instead of seeding.
  let source: any = options?.initialValues ?? {};
  if (typeof source === 'function') source = (source as () => unknown)();
  const form: Form<T> = {
    emitter,
    ...options,
    mode: options?.mode ?? 'onSubmit',
    reValidateMode: options?.reValidateMode ?? 'onChange',
    disabled: options?.disabled ?? false,
    validateDeps: options?.validateDeps
      ? new Set(options.validateDeps.map(dep => createPath(dep).key))
      : undefined,
    initialValues: {} as T,
    values: new Map(),
    deleted: new Set(),
    errors: new Map(),
    touched: new Set(),
    validators: new Map(),
    validating: new Set(),
    parsedValues: undefined,
    isSubmitting: false,
    submitCount: 0,
    isSubmitSuccessful: undefined,
    isLoading: false
  };
  if (isPromise(source)) {
    // The form starts empty; when the source resolves, its values become
    // the baseline through setInitialValues (payload-less 'change', so
    // every value subscriber re-syncs). The loading flag flips through
    // the 'loading' event before and after — no subscriber exists during
    // the first render, so the synchronous first emit is a safe no-op.
    form.isLoading = true;
    emit(emitter, 'loading');
    Promise.resolve(source).then(
      resolved => {
        form.isLoading = false;
        emit(emitter, 'loading');
        setInitialValues(form, resolved ?? {});
      },
      error => {
        form.isLoading = false;
        emit(emitter, 'loading');
        // The caller's own catch on the source sees the rejection;
        // rethrowing here would only duplicate it as an unhandled
        // promise rejection. Surface it in DEV instead.
        if (__DEV__) {
          // eslint-disable-next-line no-console -- dev-only diagnostics
          console.error('react-f0rm: async initialValues rejected', error);
        }
      }
    );
  } else {
    form.initialValues = source as T;
  }
  return form;
}

export * from './core/values';
export * from './core/errors';
export * from './core/touched';
export * from './core/dirty';
export * from './core/validate';
export * from './core/change';
export * from './core/submit';
export * from './core/focus';
