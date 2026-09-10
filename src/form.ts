import {create as createEmitter, emit, setMaxListeners} from './emitter';
import {hasStandardProps, schemaToFormValidator} from './standardSchema';
import type {StandardSchemaV1} from './standardSchema';
import type {EventEmitter} from './emitter';
import createPath from './path';
import type {Name, Path} from './path';
import type {FieldPath} from './types';
import type {FieldRules} from './rules';
import {isPromise} from './util';
import {setInitialValues} from './core/values';
import {registerField} from './core/register';
import type {SetFocusOptions} from './core/focus';
import type {VALIDATION_OUTCOME} from './core/errors';

// The implementation is split by concern under ./core (values, errors,
// touched, dirty, validate, change, submit, focus; module-private shared
// state lives in ./core/internals, which is deliberately not re-exported).
// This file keeps the public types and the create factory, and re-exports
// every public function — the single import surface the rest of the
// package (hooks, components, server, persist, resolvers) consumes.
export type {Name};
export type {
  FieldPath,
  PathValue,
  PathValueOf,
  ArrayItemOf,
  OpaqueTypes
} from './types';

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

/** When the form-level {@link Options.validate} re-runs outside
 * submit/`trigger`/`validateOnMount`:
 * - `'onSubmit'` (default): only on submit/trigger — cross-field linkage
 *   goes through {@link Options.validateDeps} instead
 * - `'onChange'`: every user change to a bound field re-runs it
 * - `'onBlur'`: every user blur of a bound field re-runs it
 *
 * TanStack Form's `validators.onChange`/`validators.onBlur` counterpart:
 * a cadence declaration instead of enumerating deps. The re-run rides the
 * changed field's own user-change pipeline (typing and `changeValue`
 * alike, never programmatic `setValue`), honors {@link
 * Options.validateDebounce}, and reuses the round-scoped error footprint —
 * a passing re-run clears what the previous round wrote.
 */
export type FormValidateMode = 'onSubmit' | 'onChange' | 'onBlur';

/**
 * Options accepted by {@link Form.register} — the non-hook binding for
 * uncontrolled fields (react-hook-form's `register` contract: the bound
 * element never re-renders; the store carries every write).
 */
export type RegisterOptions = {
  /**
   * Field-level validation mode for this binding (see {@link
   * ValidationMode}): typing gates on it exactly like a mounted
   * `useField`. Defaults to the form's `mode`.
   */
  mode?: ValidationMode;
  /**
   * Unmount behavior: `true` (the default, this library's historical
   * default) tombstones the path when the element unmounts, `false` keeps
   * the value. Falls back to the form-level
   * `createForm({shouldUnregister})` when omitted.
   */
  shouldUnregister?: boolean;
  /**
   * DOM event → value extractor for the returned `onChange`. Defaults to
   * the element's own protocol: `target.files` for file inputs,
   * `target.checked` for checkboxes, `target.valueAsNumber` /
   * `target.valueAsDate` under those flags, `target.value` otherwise —
   * the same extraction `<Field>` performs.
   */
  eventToValue?: (e: any) => any;
  /** Store `e.target.valueAsNumber` instead of the string value
   * (`<input type="number">`, RHF's `register({valueAsNumber})`). An
   * explicit `eventToValue` takes precedence. */
  valueAsNumber?: boolean;
  /** Store `e.target.valueAsDate` instead of the string value (RHF's
   * `register({valueAsDate})`). An explicit `eventToValue` takes
   * precedence; combining with `valueAsNumber` is a TypeError. */
  valueAsDate?: boolean;
  /**
   * Declarative rules for this binding — the same {@link FieldRules}
   * `useField`/`<Field>` take (`required` runs as the synchronous gate,
   * `validate` callbacks included). Wired through the framework-free
   * `registerValidatorByPath`, so `trigger`/submit/`mode` gating see it
   * exactly like a hook-registered validator. `validateDebounce` is
   * fixed at 0 — the rules run immediately on every kick.
   */
  rules?: FieldRules;
};

/**
 * What {@link Form.register} returns: spread these props onto an
 * uncontrolled DOM element (`<input {...form.register('name')} />`).
 * The bound element never re-renders — read live state through
 * `useValue`/`useError`/`getValues`, exactly like react-hook-form's
 * `register` contract. `name` is the store's path key; `onChange` writes
 * the extracted value through the gated user-change pipeline; `ref`
 * attaches the element (seeds its initial DOM content into the store,
 * wires the 'focusError' channel and bulk-reset DOM sync) and detaches it
 * on unmount (tombstone unless `shouldUnregister: false`).
 */
export type RegisterProps = {
  name: string;
  onChange: (e: any) => void;
  onBlur: () => void;
  ref: (el: any) => void;
};

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
  | ['disabled', [path?: Path]]
  | ['status', []]
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
  /** When the form-level `validate` re-runs outside submit/trigger —
   * the cadence declared by {@link Options.validateMode}, seeded at
   * create time and fixed thereafter ('onSubmit' by default; with
   * 'onChange'/'onBlur' every user change/blur to a bound field re-runs
   * it, no dep list required). */
  validateMode: FormValidateMode;
  isSubmitting: boolean;
  /** Whether a submit has been attempted — set by `handleSubmit` on every
   * attempt (validation outcome aside), cleared by `reset`.
   * `useFormState().isSubmitted` reads it (react-hook-form's
   * `formState.isSubmitted` semantics). */
  isSubmitted: boolean;
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
  /** Form-level default for mount validation, seeded from
   * {@link Options.validateOnMount}: `true` makes every mounted field
   * with a validator kick once after mount (deferred until an async
   * {@link Options.initialValues} source lands), and makes `useForm` run
   * the form-level `validate` once. A field's own `validateOnMount`
   * option overrides this flag in either direction. */
  validateOnMount: boolean;
  /** Form-level default for {@link UseValidateOptions.asyncAlways}:
   * whether a field's debounced validator still runs when its `required`
   * gate failed. A field's own `asyncAlways` option overrides this flag
   * in either direction. Seeded from {@link Options.asyncAlways}. */
  asyncAlways: boolean;
  /**
   * Whether native constraint validation gates submission (the submitted
   * element's checkValidity, skipped for targets without it — React
   * Native, toolbar buttons) and skips a bound `<Field>`'s custom
   * validators on a native-failing kick. Seeded from
   * {@link Options.shouldUseNativeValidation} — default `true`; a submit
   * may override per attempt via
   * {@link HandleSubmitOptions.shouldUseNativeValidation}.
   */
  shouldUseNativeValidation: boolean;
  /**
   * User-owned metadata slot for non-field state — session flags, server
   * backfill that belongs to no field, step indices (Formik's `status`
   * role). Written with {@link setStatus}, which emits the payload-less
   * 'status' event; read directly or reactively through {@link useStatus}.
   * Starts `undefined`.
   */
  status: any;
  /**
   * Non-hook field binding — react-hook-form's `register` contract:
   * spread the returned props onto an uncontrolled DOM element
   * (`<input {...form.register('name')} />`) and the element never
   * re-renders, while the store carries every write and `trigger`/submit
   * validate it. Seeding, the 'focusError' channel, bulk-reset DOM sync
   * and unmount tombstoning ride the `ref` callback's attach/detach —
   * no React state involved, so `register` works anywhere (dynamic
   * lists, conditional fields, non-React adapters). See {@link
   * RegisterOptions} / {@link RegisterProps}.
   */
  register: (name: Name, options?: RegisterOptions) => RegisterProps;
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
   *
   * Alternatively pass a Standard Schema v1 object directly (zod
   * v3.24+/v4, valibot v1, arktype, …) — it is wrapped into a form-level
   * validator automatically, no resolver import needed, and `TValues`
   * infers from the schema's output type:
   * `createForm({validate: schema})` → `Form<InferSchemaValues<typeof
   * schema>>`.
   */
  validate?: FormValidateFn<T> | StandardSchemaV1<unknown, T>;
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
   * When the form-level `validate` re-runs outside submit/`trigger`/
   * `validateOnMount` — a cadence declaration instead of enumerating
   * {@link Options.validateDeps}. `'onSubmit'` (the default) keeps the
   * historical behavior (submit/trigger only, deps for cross-field
   * linkage). `'onChange'` re-runs the form-level validate on every user
   * change to a bound field; `'onBlur'` on every user blur. The re-run
   * rides the changed field's own user-change pipeline (typing and
   * `changeValue` alike, never programmatic `setValue`), honors
   * {@link Options.validateDebounce}, and clears what the previous round
   * wrote — TanStack Form's `validators.onChange`/`validators.onBlur`
   * counterpart. See {@link FormValidateMode}.
   */
  validateMode?: FormValidateMode;
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
  /**
   * Form-level default for field validation's `asyncAlways`: when true,
   * a field whose `required` gate failed still runs its debounced
   * validator (the gate's errors land immediately, the validator's own
   * result lands alongside them per-source). TanStack Form's
   * `asyncAlways` counterpart. A field's own
   * `useField({asyncAlways})` option overrides the form-level flag in
   * either direction. Defaults to `false`.
   */
  asyncAlways?: boolean;
  /**
   * Whether native constraint validation gates submission and skips a
   * bound `<Field>`'s custom validators when its native constraints fail
   * that kick (react-hook-form's `shouldUseNativeValidation`): pass
   * `false` for forms where custom validators are the only source of
   * truth — the browser's checkValidity/reportValidity gate (and the
   * per-kick native gate in `<Field>`) stop running, while declarative
   * `rules` keep producing store-side errors and native constraint
   * attributes keep rendering for a11y. Defaults to `true`. Fixed at
   * create time; a single submit may override it through
   * {@link HandleSubmitOptions.shouldUseNativeValidation}.
   */
  shouldUseNativeValidation?: boolean;
  /**
   * Validate on mount: `true` makes every mounted field with a validator
   * (declarative `rules` or a `validate` callback) run it once after
   * mount, instead of waiting for the first submit/change — errors show
   * immediately for an untouched form (Formik's `validateOnMount` /
   * TanStack Form's per-field `validateOnMount`). The form-level
   * `validate` also runs once after mount. Mount kicks are deferred
   * while an async `initialValues` source is still pending: validating
   * the empty shell would land spurious required errors, so the kicks
   * fire after the resolved baseline lands instead. A field's own
   * `useField({validateOnMount})` option overrides the form-level flag
   * in either direction. Defaults to `false`.
   */
  validateOnMount?: boolean;
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
  const validateOption = options?.validate;
  // A Standard Schema passed straight to `validate` is wrapped into a
  // form-level validator (issues land per-path, parsed output becomes
  // the parsedValues baseline) — no resolver import needed. The casts
  // split the union the guard can't narrow (see hasStandardProps).
  const wrappedValidate: FormValidateFn<T> | undefined =
    validateOption && hasStandardProps(validateOption)
      ? (schemaToFormValidator(
          validateOption as StandardSchemaV1<unknown, T>
        ) as FormValidateFn<T>)
      : (validateOption as FormValidateFn<T> | undefined);
  const form: Form<T> = {
    emitter,
    ...options,
    validate: wrappedValidate,
    mode: options?.mode ?? 'onSubmit',
    reValidateMode: options?.reValidateMode ?? 'onChange',
    validateMode: options?.validateMode ?? 'onSubmit',
    disabled: options?.disabled ?? false,
    validateOnMount: options?.validateOnMount ?? false,
    asyncAlways: options?.asyncAlways ?? false,
    shouldUseNativeValidation: options?.shouldUseNativeValidation ?? true,
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
    isSubmitted: false,
    submitCount: 0,
    isSubmitSuccessful: undefined,
    isLoading: false,
    status: undefined,
    register: (name, registerOptions) =>
      registerField(form, name, registerOptions)
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
        // Values land first, then the flag flips and 'loading' fires —
        // subscribers waking on the event read the resolved baseline, not
        // the empty shell (mount-validation deferral among them).
        setInitialValues(form, resolved ?? {});
        form.isLoading = false;
        emit(emitter, 'loading');
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
export * from './core/array';
export * from './core/errors';
export * from './core/touched';
export * from './core/dirty';
export * from './core/validate';
export * from './core/change';
export * from './core/register';
export * from './core/submit';
export * from './core/focus';
