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

// Implementation is split by concern under ./core; module-private shared
// state lives in ./core/internals (deliberately not re-exported). This
// file keeps the public types + create factory and re-exports every
// public function — the single import surface the package consumes.
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

/** A field error: `type` is the error kind, `message` the display text. */
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
 * - `'onSubmit'` (default): submit/trigger only — cross-field linkage via
 *   {@link Options.validateDeps}
 * - `'onChange'`: every user change to a bound field
 * - `'onBlur'`: every user blur of a bound field
 */
export type FormValidateMode = 'onSubmit' | 'onChange' | 'onBlur';

/**
 * Options accepted by {@link Form.register} — the non-hook binding for
 * uncontrolled fields (react-hook-form's `register` contract: the bound
 * element never re-renders; the store carries every write).
 */
export type RegisterOptions = {
  /** Field-level validation mode for this binding; defaults to the form's
   * `mode`. */
  mode?: ValidationMode;
  /** Unmount behavior: `true` (the library's historical default) tombstones
   * the path, `false` keeps the value. Falls back to the form-level
   * `createForm({shouldUnregister})` when omitted. */
  shouldUnregister?: boolean;
  /** DOM event → value extractor for the returned `onChange`. Defaults to
   * the element's protocol (`target.files`/`target.checked`/
   * `target.valueAsNumber`/`target.valueAsDate`, else `target.value`) —
   * the same extraction `<Field>` performs. */
  eventToValue?: (e: any) => any;
  /** Store `e.target.valueAsNumber` instead of the string value. An
   * explicit `eventToValue` takes precedence. */
  valueAsNumber?: boolean;
  /** Store `e.target.valueAsDate` instead of the string value. An explicit
   * `eventToValue` takes precedence; combining with `valueAsNumber` is a
   * TypeError. */
  valueAsDate?: boolean;
  /** Declarative rules for this binding — the same {@link FieldRules}
   * `useField`/`<Field>` take (`required` runs as the synchronous gate).
   * Wired through `registerValidatorByPath`, so `trigger`/submit/`mode`
   * gating see it like a hook-registered validator; `validateDebounce` is
   * fixed at 0. */
  rules?: FieldRules;
};

/** What {@link Form.register} returns: spread these onto an uncontrolled
 * DOM element (`<input {...form.register('name')} />`). `name` is the
 * store's path key; `onChange` writes through the gated user-change
 * pipeline; `ref` attach seeds the element's DOM content and detach
 * tombstones unless `shouldUnregister: false`. */
export type RegisterProps = {
  name: string;
  onChange: (e: any) => void;
  onBlur: () => void;
  ref: (el: any) => void;
};

/** Structured form-level validate result: `errors` uses the same nested
 * shape a plain error record uses, `values` is the schema's parsed output
 * (coerce/transform included). Either side may be omitted. The brand
 * constant lives in the errors module and is re-exported below. */
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

/** Context passed to a form-level `validate`'s second argument. `signal`
 * aborts when the round is superseded (only under a positive
 * `validateDebounce`, where kicks merge), so async work can be cancelled;
 * stale results are dropped by the round gate either way. */
export type FormValidateMeta<T extends Record<string, any> = any> = {
  form: Form<T>;
  signal: AbortSignal;
};

/** Form-level validator: receives all values (plus an optional {@link
 * FormValidateMeta}) and returns a {@link ValidateResult} — sync or async
 * — or `undefined` when valid (falsy results are skipped). */
export type FormValidateFn<T extends Record<string, any> = any> = (
  values: T,
  meta: FormValidateMeta<T>
) => ValidateResult<T> | undefined;

/** The emitter event table for {@link Form.emitter}: path-carrying events
 * declare an optional single `Path` payload (sent for single-field
 * mutations, omitted for bulk payload-less broadcasts); `focusError`
 * carries the path key plus optional {@link SetFocusOptions}. */
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
   * write-side {@link setErrorByPath} normalizes to this invariant).
   * First entry via {@link getError}, all of them via
   * {@link getFieldErrors}. */
  errors: Map<string, FieldError[]>;
  touched: Set<string>;
  /** Per-field validation kicks registered by {@link
   * registerValidatorByPath}: invoking one validates the field's current
   * value. `trigger`/`ensureValidate` run every entry; the user-change
   * gate runs the entry at the changed path. */
  validators: Map<string, () => void>;
  validating: Set<string>;
  /** Parsed values from the last successful schema validation: layered
   * between initialValues and the values Map in {@link getValues}, cleared
   * by `reset`/`setInitialValues`. Never affects dirty state. */
  parsedValues: T | undefined;
  /** Form-level validator, seeded from {@link Options.validate}. */
  validate?: FormValidateFn<T>;
  /** Delay in ms before the form-level `validate` runs; seeded from
   * {@link Options.validateDebounce} and fixed at create time. */
  validateDebounce?: number;
  /** Path keys whose user changes re-run the form-level `validate`;
   * normalized from {@link Options.validateDeps} at create time. */
  validateDeps?: ReadonlySet<string>;
  /** When the form-level `validate` re-runs outside submit/trigger — the
   * cadence from {@link Options.validateMode}, seeded at create time. */
  validateMode: FormValidateMode;
  isSubmitting: boolean;
  /** Whether a submit has been attempted — set by `handleSubmit` on every
   * attempt, cleared by `reset` (react-hook-form's `isSubmitted`). */
  isSubmitted: boolean;
  submitCount: number;
  isSubmitSuccessful: boolean | undefined;
  /** True while an async {@link Options.initialValues} source is pending —
   * the form starts empty and the resolved values land as the baseline.
   * Flips through the payload-less 'loading' event. */
  isLoading: boolean;
  /** Form-level default for a bound field's unmount behavior: `true` (the
   * default) tombstones an unmounted field, `false` keeps its value. A
   * field's own `shouldUnregister` option overrides this. */
  shouldUnregister?: boolean;
  /** Form-level disabled flag, OR-ed into every bound field's `disabled`
   * (form flag || the field's own option). Toggled at runtime with
   * {@link setDisabled}, which emits a payload-less 'disabled' event. */
  disabled: boolean;
  /** Form-level default for mount validation: `true` kicks every mounted
   * field's validator once after mount (deferred until an async
   * {@link Options.initialValues} source lands) and runs the form-level
   * `validate` once. A field's own option overrides this. */
  validateOnMount: boolean;
  /** Form-level default for `asyncAlways`: whether a field's debounced
   * validator still runs when its `required` gate failed. A field's own
   * option overrides this flag. */
  asyncAlways: boolean;
  /** Whether native constraint validation gates submission and skips a
   * bound `<Field>`'s custom validators on a native-failing kick. Seeded
   * from {@link Options.shouldUseNativeValidation} (default `true`); a
   * submit may override per attempt. */
  shouldUseNativeValidation: boolean;
  /** User-owned metadata slot for non-field state (Formik's `status`
   * role). Written with {@link setStatus}, which emits the payload-less
   * 'status' event; read via {@link useStatus}. Starts `undefined`. */
  status: any;
  /** Non-hook field binding — react-hook-form's `register` contract:
   * spread the returned props onto an uncontrolled DOM element and the
   * element never re-renders while the store carries every write. No
   * React state involved, so it works anywhere. See {@link
   * RegisterOptions} / {@link RegisterProps}. */
  register: (name: Name, options?: RegisterOptions) => RegisterProps;
};

export type Options<T extends Record<string, any> = any> = {
  /** The values baseline. Sync objects seed immediately; async sources (a
   * Promise, or a thunk returning a value/Promise) start the form empty
   * with `isLoading: true` and land the resolved values as the baseline
   * via setInitialValues. A rejected source keeps the form empty and logs
   * in DEV. The thunk runs at create time. */
  initialValues?: T | Promise<T> | (() => T | Promise<T>);
  /** When fields are validated. Defaults to `'onSubmit'`. See
   * {@link ValidationMode}. */
  mode?: ValidationMode;
  /** When a field is re-validated after it already has an error. Defaults
   * to `'onChange'`. See {@link ReValidateMode}. */
  reValidateMode?: ReValidateMode;
  /** Form-level validator: returns a record of errors keyed by field path
   * (nested objects flattened 'a.b' style, array values contribute each
   * non-empty string). A branded {@link ValidationOutcome} adds parsed
   * `values` as the parsedValues baseline. Alternatively pass a Standard
   * Schema v1 object directly — it is wrapped into a validator
   * automatically. */
  validate?: FormValidateFn<T> | StandardSchemaV1<unknown, T>;
  /** Milliseconds to debounce the form-level `validate`: kicks inside the
   * window merge into one run, and while the timer is pending the form
   * counts as validating. Defaults to `0` (runs immediately). */
  validateDebounce?: number;
  /** Fields whose user changes re-run the form-level `validate` — the
   * cross-field dependency list. A re-run only clears errors the previous
   * round wrote; errors the round never wrote are untouched. Omit it and
   * the form-level `validate` only runs on `trigger`/submit. */
  validateDeps?: FieldPath<T>[];
  /** When the form-level `validate` re-runs outside submit/`trigger`/
   * `validateOnMount` — a cadence declaration instead of enumerating
   * {@link Options.validateDeps}. See {@link FormValidateMode}. */
  validateMode?: FormValidateMode;
  /** Form-level default for a bound field's unmount behavior. `true` (the
   * default) tombstones an unmounted field; `false` keeps the value
   * (react-hook-form's `shouldUnregister`). A field's own option
   * overrides this. */
  shouldUnregister?: boolean;
  /** Start the form with every bound field disabled — bound fields OR this
   * flag with their own `disabled` option (a field cannot opt out).
   * Toggle later with {@link setDisabled}. Defaults to `false`. */
  disabled?: boolean;
  /** Form-level default for `asyncAlways`: when true, a field whose
   * `required` gate failed still runs its debounced validator (the gate's
   * errors land immediately, the validator's result lands alongside
   * them per-source). A field's own option overrides this. Defaults to
   * `false`. */
  asyncAlways?: boolean;
  /** Whether native constraint validation gates submission and skips a
   * bound `<Field>`'s custom validators on a native-failing kick
   * (react-hook-form's `shouldUseNativeValidation`). Defaults to `true`.
   * Fixed at create time; a single submit may override it. */
  shouldUseNativeValidation?: boolean;
  /** Validate on mount: `true` makes every mounted field's validator run
   * once after mount (errors show for an untouched form) and runs the
   * form-level `validate` once. Mount kicks are deferred while an async
   * `initialValues` source is pending. A field's own option overrides
   * this. Defaults to `false`. */
  validateOnMount?: boolean;
};

/** Seed the baseline: a sync value becomes initialValues immediately; an
 * async source starts the form empty and lands the resolved values via
 * setInitialValues, flipping isLoading and the 'loading' event around it. */
function seedInitialValues<T extends Record<string, any>>(
  form: Form<T>,
  emitter: EventEmitter<FormEvents>,
  source: unknown
): void {
  if (!isPromise(source)) {
    form.initialValues = source as T;
    return;
  }
  // The form starts empty; the resolved values become the baseline
  // through setInitialValues. No subscriber exists during the first
  // render, so the synchronous first 'loading' emit is a safe no-op.
  form.isLoading = true;
  emit(emitter, 'loading');
  Promise.resolve(source).then(
    resolved => {
      // Values land first, then the flag flips and 'loading' fires — so
      // subscribers waking on the event read the resolved baseline, not
      // the empty shell (mount-validation deferral among them).
      setInitialValues(form, resolved ?? {});
      form.isLoading = false;
      emit(emitter, 'loading');
    },
    error => {
      form.isLoading = false;
      emit(emitter, 'loading');
      // The caller's own catch sees the rejection; rethrowing would
      // duplicate it as an unhandled rejection. Surface it in DEV.
      if (__DEV__) {
        // eslint-disable-next-line no-console -- dev-only diagnostics
        console.error('react-f0rm: async initialValues rejected', error);
      }
    }
  );
}

/** Create a form instance. */
export default function create<T extends Record<string, any> = any>(
  options?: Options<T>
): Form<T> {
  const emitter = createEmitter<FormEvents>();
  // A form accumulates one listener per mounted field per event, so the
  // emitter's default max-listener warning would fire in DEV for any form
  // over ~10 fields. Subscriptions are removed on unmount — nothing leaks
  // — so the warning is noise: raise the cap to unlimited.
  setMaxListeners(emitter, 0);
  // A thunk is invoked at create time; a promise result starts the
  // loading cycle in seedInitialValues instead of seeding here.
  const initialSource: any = options?.initialValues ?? {};
  const source =
    typeof initialSource === 'function'
      ? (initialSource as () => unknown)()
      : initialSource;
  const validateOption = options?.validate;
  // A Standard Schema passed to `validate` is wrapped into a form-level
  // validator — no resolver import needed. The casts split the union the
  // guard can't narrow (see hasStandardProps).
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
  seedInitialValues(form, emitter, source);
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
