import {emit} from '../emitter';
import createPath, {segmentsFromKey} from '../path';
import type {Name, Path, PathSegments} from '../path';
import {isIndex, isPromise, normalizePath, waitUntil} from '../util';
import type {
  FieldError,
  FieldErrorEntry,
  Form,
  ReValidateMode,
  ValidationMode,
  ValidateResult,
  ValidationOutcome
} from '../form';
import {
  VALIDATION_OUTCOME,
  ValidatorOutput,
  getErrors,
  getFirstError,
  hasErrors,
  setError,
  setErrorByPath
} from './errors';
import {hasTouchedByPath, setTouchedByPath} from './touched';
import {getValueByPath, getValues} from './values';
import {
  bumpErrorsVersion,
  getOrCreate,
  isFieldError,
  isSegmentsPath,
  setParsedValues
} from './internals';

type ErrorFootprint = Map<string, FieldError[]>;

/** The meta bag passed to a validator's second argument. */
type ValidatorMeta = {form: Form; path: Path};

/** A pending debounce-window handle, Node or DOM flavored. */
type Timer = ReturnType<typeof setTimeout> | null;

export function unsetValidatingByPath(
  {emitter, validating}: Form,
  path: Path
): void {
  validating.delete(path.key);
  emit(emitter, 'validating', path);
}

export function setValidatingByPath(
  {emitter, validating}: Form,
  path: Path
): void {
  validating.add(path.key);
  emit(emitter, 'validating', path);
}

/** Field validator: an error (string, FieldError, or an array mixing
 * both) or undefined — synchronously or as a Promise. `meta.signal`
 * aborts when the round is superseded, so async work can be cancelled;
 * stale results are dropped by the round lock either way. Older
 * two-argument signatures keep working. */
export type Validator = (
  value: any,
  meta: ValidatorMeta & {signal: AbortSignal}
) => ValidatorOutput | undefined | Promise<ValidatorOutput | undefined>;

/** Synchronous pre-validator (declarative `required` gates in practice):
 * runs on every kick, never debounced; its errors land immediately and
 * short-circuit the debounced validator while present. No Promise, no
 * `signal` — nothing to abort. */
export type SyncValidator = (
  value: any,
  meta: ValidatorMeta
) => ValidatorOutput | undefined;

/** Live options for {@link registerValidatorByPath}: accessors, read at
 * every kick, so `useValidate` can swap them per render without
 * re-subscribing mid-flight. */
export type ValidatorRegistration = {
  validate: () => Validator | undefined;
  /** Debounce delay in milliseconds; 0 (default) runs immediately. */
  debounce: () => number;
  /** Runs on every kick, never debounced. */
  sync: () => SyncValidator | undefined;
  /** Keep the debounced validator running when the sync gate failed
   * (TanStack `asyncAlways`): gate errors land immediately, the
   * validator's result lands alongside them per-source. Absent = false
   * (gate owns the outcome). */
  asyncAlways?: () => boolean;
};

/**
 * Register a field validator's kick at `path` ({@link Form.validators})
 * — the framework-free machinery behind `useValidate`. Returns a
 * disposer that drops the registration and cancels pending work.
 *
 * Contract (what `trigger`/`ensureValidate`/the user-change gate rely
 * on): the `sync` gate runs on every kick, never debounced, and
 * short-circuits the debounced validator while failing — unless
 * `asyncAlways`, which lands the validator's result alongside the
 * gate's (per-source); a positive `debounce` merges kicks, and the
 * field counts as validating while the window is pending; async results
 * land under a round lock — superseded outcomes drop, only the owning
 * round releases the mark; a synchronous throw propagates. Registering
 * at an occupied path replaces the entry (last-wins).
 */
export function registerValidatorByPath(
  form: Form,
  path: Path,
  registration: ValidatorRegistration
): () => void {
  let timer: Timer = null;
  let controller: AbortController | null = null;
  let marked = false;
  let lock: object | null = null;
  // Which source wrote the error on display — so a passing sync check
  // clears its own stale error immediately. External writers (setError,
  // form validate) are invisible here; clearing them on a pass is the
  // long-standing "validator owns its whole key" contract.
  let errorSource: 'sync' | 'validator' | null = null;
  const hasErrors = (errors: any): boolean =>
    errors !== undefined && !(Array.isArray(errors) && errors.length === 0);
  const mark = () => {
    if (marked) return;
    marked = true;
    setValidatingByPath(form, path);
  };
  const unmark = () => {
    if (!marked) return;
    marked = false;
    unsetValidatingByPath(form, path);
  };

  /** Run the sync gate (never debounced). Errors land immediately; a
   * passing gate clears its own stale error — or any error when no
   * debounced validator exists to own the round. */
  const runSync = (): boolean => {
    const sync = registration.sync();
    if (!sync) return false;
    const errors = sync(getValueByPath(form, path), {form, path});
    if (!hasErrors(errors)) {
      if (!registration.validate() || errorSource === 'sync') {
        setErrorByPath(form, path, undefined);
        errorSource = null;
      }
      return false;
    }
    setErrorByPath(form, path, errors);
    errorSource = 'sync';
    return true;
  };

  /** Re-run the sync gate read-only: asyncAlways landings merge its
   * verdict with the validator's result (per-source). */
  const collectSyncErrors = (): (string | FieldError)[] | null => {
    const sync = registration.sync();
    if (!sync) return null;
    const errors = sync(getValueByPath(form, path), {form, path});
    if (errors === undefined) return null;
    const list = Array.isArray(errors) ? errors : [errors];
    return list.length ? list : null;
  };

  /** Land a validator result. asyncAlways merges the re-collected gate
   * verdict ahead of the validator's errors; the default path keeps the
   * historical "validator owns the whole key" write. */
  const land = (result: ValidatorOutput | undefined): void => {
    if (registration.asyncAlways?.()) {
      const gate = collectSyncErrors();
      const own =
        result === undefined ? [] : Array.isArray(result) ? result : [result];
      setErrorByPath(form, path, [...(gate ?? []), ...own]);
      errorSource = hasErrors(result) ? 'validator' : gate ? 'sync' : null;
    } else {
      setErrorByPath(form, path, result);
      errorSource = hasErrors(result) ? 'validator' : null;
    }
  };

  const supersede = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    controller?.abort();
    lock = {};
  };

  const runValidator = () => {
    const fn = registration.validate();
    if (!fn) {
      unmark();
      return;
    }
    // The lock refresh below drops results that ignore the abort.
    controller?.abort();
    controller = new AbortController();
    const round = (lock = {});
    let result;
    try {
      result = fn(getValueByPath(form, path), {
        form,
        path,
        signal: controller.signal
      });
    } catch (e) {
      // A throwing sync validator propagates to the caller as it always
      // has; just don't leave the validating mark stuck behind it.
      unmark();
      throw e;
    }
    if (!isPromise(result)) {
      land(result);
      // Error first, then release the mark: 'validating' subscribers
      // (trigger) re-read state on wake and must see the landed error.
      unmark();
      return;
    }
    mark();
    result
      .then((error: ValidatorOutput | undefined) => {
        if (lock === round) {
          land(error);
        }
      })
      // Rejection is how aborted validators give up (AbortError); the
      // owning round writes the outcome.
      .catch(() => {})
      .finally(() => {
        if (lock === round) {
          unmark();
          lock = null;
        }
      });
  };

  /** Run the sync gate; when it fails without asyncAlways, the gate owns
   * the outcome — supersede pending work, release the mark. */
  const gateOwnsKick = (): boolean => {
    if (!(runSync() && !registration.asyncAlways?.())) return false;
    supersede();
    unmark();
    return true;
  };

  /** Window fired: re-run the sync gate first — programmatic writes do
   * not kick validators, so the value may have drifted. */
  const run = () => {
    timer = null;
    if (gateOwnsKick()) return;
    runValidator();
  };

  const kick = () => {
    if (gateOwnsKick()) return;
    if (!registration.validate()) return;
    const debounce = registration.debounce();
    if (debounce > 0) {
      // The mark keeps trigger/ensureValidate waiting through the
      // pending timer, not just in-flight promises.
      if (timer !== null) clearTimeout(timer);
      else mark();
      timer = setTimeout(run, debounce);
      return;
    }
    runValidator();
  };

  form.validators.set(path.key, kick);
  return () => {
    form.validators.delete(path.key);
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    unmark();
    controller?.abort();
  };
}

/** Options accepted by {@link trigger}. `shouldTouch` defaults to `false`;
 * omitting the options object entirely keeps the plain validate-only
 * behavior, so the historical two-argument calls are untouched. */
export type TriggerOptions = {
  /** Mark the triggered scope touched once the round settles, pass or
   * fail (RHF trigger `shouldTouch`). Defaults to `false`. */
  shouldTouch?: boolean;
  /** Focus the first errored field in the triggered scope once the round
   * settles (RHF trigger `shouldFocus`). Rides the 'focusError' channel
   * like failed-submit auto-focus; unmounted paths are silent no-ops.
   * Defaults to `false`. */
  shouldFocus?: boolean;
};

/**
 * Trigger validation. Without `name`: every registered field validator,
 * then the form-level `validate` (after fields settle, same pipeline as
 * {@link ensureValidate}). One name runs that field only; a name array
 * runs each in order; `[]` is a no-op. A segments array mixes in numbers
 * (`['items', 0]`); pure string arrays are name lists (`['a', 'b']`
 * triggers fields `a` and `b`, not the nested path).
 *
 * The promise waits for the round to settle (async validators included)
 * and never rejects — it resolves whether the triggered scope is
 * error-free. With `name`, only those fields' errors count and
 * form-level `validate` is skipped (RHF semantics). Fire-and-forget
 * callers may ignore it: the kicks still run synchronously.
 */
export async function trigger(
  form: Form,
  name?: Name | Name[],
  options?: TriggerOptions
): Promise<boolean> {
  // Never reject: an error landing is a normal outcome. Without a name
  // the wait is deliberately conservative — every field validator,
  // unrelated in-flight ones included, because the round covers the
  // whole form (the form-level validate's own window is excluded via
  // fieldsSettled — callers wait that out through the kick's promise).
  // With a name the wait narrows to the triggered keys: a slow async
  // validator on field B must not hold trigger('a') hostage.
  const settle = (keys?: string[]) =>
    waitUntil(
      form.emitter,
      'validating',
      () =>
        keys === undefined
          ? fieldsSettled(form)
          : keys.every(key => !form.validating.has(key)),
      () => false
    );
  // First error wins, like failed-submit auto-focus; a form-level error
  // lands first but has no element — a silent no-op like every unbound
  // path.
  const focusFirstError = (keys?: string[]) => {
    const firstKey =
      keys === undefined
        ? form.errors.keys().next().value
        : keys.find(key => form.errors.has(key));
    if (firstKey !== undefined) emit(form.emitter, 'focusError', firstKey);
  };

  if (name === undefined) {
    form.validators.forEach(validator => validator());
    await settle();
    if (form.validate) await runFormValidate(form);
    if (options?.shouldTouch) touchKeys(form, [...form.validators.keys()]);
    if (options?.shouldFocus) focusFirstError();
    return !hasErrors(form);
  }

  const keys: string[] =
    typeof name === 'string' || isSegmentsPath(name)
      ? [createPath(name).key]
      : name.map(one => createPath(one).key);
  keys.forEach(key => form.validators.get(key)?.());
  await settle(keys);
  if (options?.shouldTouch) touchKeys(form, keys);
  if (options?.shouldFocus) focusFirstError(keys);
  return keys.every(key => !form.errors.has(key));
}

/** trigger's shouldTouch marking: setTouchedByPath no-ops on
 * already-touched keys and emits the path-payload 'touched' event per
 * newly touched one. */
function touchKeys(form: Form, keys: string[]): void {
  keys.forEach(key => setTouchedByPath(form, createPath(segmentsFromKey(key))));
}

/** Flatten a form-level validate result into field errors: nested objects
 * descend ({a: {b: 'msg'}} → the 'a.b' error), arrays contribute every
 * non-empty string (zod formErrors style), FieldError objects are stored
 * as-is, falsy values skipped. With `footprint` (validateDeps / live
 * validateMode forms) each stored leaf is recorded — the exact stored
 * array — so the next round can drop exactly what this one wrote. */
function setFormErrors(
  form: Form,
  result: Record<string, any>,
  segments: PathSegments = [],
  footprint?: ErrorFootprint
): void {
  Object.entries(result).forEach(([key, value]) => {
    // Numeric keys are explicit object keys, not path expressions: '0'
    // (Standard Schema issue paths stringify array indices) stays a
    // literal string segment instead of feeding the path parser.
    const path: PathSegments = [
      ...segments,
      ...(isIndex(key) ? [key] : normalizePath(key))
    ];
    if (typeof value === 'string') {
      if (value) landLeafError(form, path, value, footprint);
    } else if (Array.isArray(value) || isFieldError(value)) {
      landLeafError(form, path, value, footprint);
    } else if (value && typeof value === 'object') {
      setFormErrors(form, value, path, footprint);
    }
  });
}

/** Record one leaf write into the round's footprint: the path key and
 * the exact stored array (read back — setErrorByPath owns
 * normalization; all-empty writes record nothing). */
function recordFootprint(
  form: Form,
  segments: PathSegments,
  footprint: ErrorFootprint | undefined
): void {
  if (!footprint) return;
  const path = createPath(segments);
  const stored = form.errors.get(path.key);
  if (stored) footprint.set(path.key, stored);
}

function landLeafError(
  form: Form,
  path: PathSegments,
  error: ValidatorOutput,
  footprint?: ErrorFootprint
): void {
  setError(form, path, error);
  recordFootprint(form, path, footprint);
}

/** Land a form-level validate result. A plain record flattens into field
 * errors; a branded {@link ValidationOutcome} also sets `values` as the
 * parsedValues baseline. Forms re-running the validate on user input
 * (validateDeps or a live validateMode) get round-scoped ownership: the
 * previous round's errors are dropped first, so a passing re-run clears
 * its cross-field error; submit-only forms keep the write-only
 * behavior. */
function applyValidateResult(
  form: Form,
  result: ValidateResult<any> | undefined
): void {
  const footprint =
    form.validateDeps || form.validateMode !== 'onSubmit'
      ? getFormErrorFootprint(form)
      : undefined;
  if (footprint) {
    clearFormValidateErrors(form, footprint);
    footprint.clear();
  }
  if (!result) return;
  if (typeof result === 'object' && VALIDATION_OUTCOME in result) {
    const outcome = result as ValidationOutcome<any>;
    if (outcome.errors) setFormErrors(form, outcome.errors, [], footprint);
    setParsedValues(form, outcome.values);
    return;
  }
  setFormErrors(form, result as Record<string, any>, [], footprint);
}

/** Per-form footprint of the last form-level round: path key → the exact
 * stored array. WeakMap — the Form shape stays untouched. */
const formErrorFootprints = new WeakMap<Form, ErrorFootprint>();

function getFormErrorFootprint(form: Form): ErrorFootprint {
  return getOrCreate(formErrorFootprints, form, () => new Map());
}

/** Does the form still show an error the last round wrote? Identity
 * comparison: once a field validator, setServerErrors, setError or
 * clearErrors replaces the stored array, the error is no longer the
 * round's to own. */
function hasFormValidateErrors(form: Form): boolean {
  const footprint = formErrorFootprints.get(form);
  if (!footprint) return false;
  for (const [key, written] of footprint) {
    if (form.errors.get(key) === written) return true;
  }
  return false;
}

/** Drop the last round's errors before the next lands, per key
 * identity-checked (overwritten/cleared errors survive); each drop emits
 * the same path-payload 'errors' event as setErrorByPath. */
function clearFormValidateErrors(form: Form, footprint: ErrorFootprint): void {
  for (const [key, written] of footprint) {
    const stored = form.errors.get(key);
    if (stored !== written) continue;
    form.errors.delete(key);
    bumpErrorsVersion(form);
    emit(form.emitter, 'errors', createPath(segmentsFromKey(key)));
  }
}

/** Reserved validating key for the form-level round; real path keys are
 * JSON arrays, so a bare word can never collide. */
const FORM_VALIDATING_KEY = '__form_validate__';

/** Are all FIELD rounds drained? The form validate's own reserved key is
 * excluded — its window is waited out through the kick's promise, so a
 * pending form window never gates the next kick (a newer round
 * supersedes, mirroring per-field debounce). */
function fieldsSettled(form: Form): boolean {
  for (const key of form.validating) {
    if (key !== FORM_VALIDATING_KEY) return false;
  }
  return true;
}

/** Sentinel telling {@link settleFormValidate} the round landed cleanly —
 * distinct from every rejection payload, including `undefined`. */
const SETTLED = Symbol('form-validate-settled');

type FormValidateState = {
  timer: Timer;
  controller: AbortController | null;
  /** Identity of the in-flight round; superseded outcomes (rejections
   * included) are dropped by comparing against it. */
  round: object | null;
  marked: boolean;
  waiters: Array<{resolve: () => void; reject: (error: unknown) => void}>;
};

/** Per-form debounced-validate bookkeeping — WeakMap, so the Form shape
 * stays untouched for forms that never set `validateDebounce`. */
const formValidateStates = new WeakMap<Form, FormValidateState>();

function getFormValidateState(form: Form): FormValidateState {
  return getOrCreate(formValidateStates, form, () => ({
    timer: null,
    controller: null,
    round: null,
    marked: false,
    waiters: []
  }));
}

/**
 * Run the form-level `validate` and land its result, honoring
 * `validateDebounce`. Undebounced: the caller's await is the call — no
 * mark, no gating, rejection propagates. Debounced: kicks merge into a
 * window (the form counts as validating), the round reads then-current
 * values and supersedes in-flight rounds, and every merged caller's
 * promise settles with the final round's outcome. Form-level-only round:
 * `useForm`'s validateOnMount and cross-cutting re-checks; `trigger` /
 * `ensureValidate` compose it after fields settle.
 */
export function runFormValidate(form: Form): Promise<void> {
  const validate = form.validate;
  if (!validate) return Promise.resolve();
  const debounce = form.validateDebounce ?? 0;
  if (debounce <= 0) {
    // Argument-shape parity with the debounced rounds; the signal never
    // fires (nothing supersedes an undebounced call).
    const controller = new AbortController();
    return Promise.resolve(
      validate(getValues(form), {form, signal: controller.signal})
    ).then(result => {
      applyValidateResult(form, result);
    });
  }
  const state = getFormValidateState(form);
  // Re-open the window: pending kicks restart the timer; an in-flight
  // round keeps the mark held until the new window's round.
  if (state.timer !== null) clearTimeout(state.timer);
  else {
    state.marked = true;
    form.validating.add(FORM_VALIDATING_KEY);
    emit(form.emitter, 'validating');
  }
  state.timer = setTimeout(() => {
    state.timer = null;
    const round = (state.round = {});
    runFormValidateRound(form, state, round).then(
      () => settleFormValidate(form, state, round, SETTLED),
      error => settleFormValidate(form, state, round, error)
    );
  }, debounce);
  return new Promise<void>((resolve, reject) => {
    state.waiters.push({resolve, reject});
  });
}

/** One round with the current values; aborts and drops the superseded
 * round, field-lock style. */
function runFormValidateRound(
  form: Form,
  state: FormValidateState,
  round: object
): Promise<void> {
  const validate = form.validate;
  if (!validate) return Promise.resolve();
  state.controller?.abort();
  const controller = (state.controller = new AbortController());
  // The Promise constructor turns a synchronous validator throw into a
  // rejection — the try/catch comes for free.
  const outcome = new Promise<any>(resolve =>
    resolve(validate(getValues(form), {form, signal: controller.signal}))
  );
  return outcome.then(
    result => {
      if (state.round === round) applyValidateResult(form, result);
    },
    error => {
      if (state.round === round) throw error;
    }
  );
}

/** Land the window group: release the mark (after the round's errors
 * landed — 'validating' subscribers re-read state on wake), settle every
 * merged waiter. A superseded round never lands here; a re-opened window
 * carries the mark and waiters over to the pending round. */
function settleFormValidate(
  form: Form,
  state: FormValidateState,
  round: object,
  outcome: unknown
): void {
  if (state.round !== round) return;
  state.round = null;
  if (state.timer !== null) return;
  if (state.marked) {
    state.marked = false;
    form.validating.delete(FORM_VALIDATING_KEY);
    emit(form.emitter, 'validating');
  }
  const waiters = state.waiters;
  state.waiters = [];
  for (const waiter of waiters) {
    if (outcome === SETTLED) waiter.resolve();
    else waiter.reject(outcome);
  }
}

/** The mode/reValidateMode gate shared by change/blur kicks and both
 * validateDeps re-runs: fires for `cadence` and `'all'`, for
 * `'onTouched'` once touched, else when `reValidateMode` matches
 * `cadence` and an error is still live. `hasError` reads lazily. */
export function shouldKick(
  mode: ValidationMode,
  cadence: 'onChange' | 'onBlur',
  touched: boolean,
  hasError: () => boolean,
  reValidateMode: ReValidateMode
): boolean {
  return (
    mode === cadence ||
    mode === 'all' ||
    (mode === 'onTouched' && touched) ||
    (reValidateMode === cadence && hasError())
  );
}

/**
 * Form-level twin of the gated change kick: re-run `validate` after a
 * user change to a field in `validateDeps`. Rides the changed field's
 * onChange pipeline, so programmatic setValue writes never fire it. The
 * gate uses the changed field's effective `mode` and the form-level
 * `reValidateMode` against the last round's error footprint:
 * onChange/all — every dep change; onTouched — once touched; otherwise
 * while the round's error is still live under reValidateMode onChange
 * (the submit-then-fix flow). Fire-and-forget: async rejections are
 * swallowed, sync throws propagate. A no-op (one property check) unless
 * `validateDeps` lists `path`.
 */
export function revalidateFormOnChange(
  form: Form,
  path: Path,
  mode: ValidationMode
): void {
  if (!form.validateDeps?.has(path.key) || !form.validate) return;
  if (
    shouldKick(
      mode,
      'onChange',
      hasTouchedByPath(form, path),
      () => hasFormValidateErrors(form),
      form.reValidateMode
    )
  ) {
    runFormValidate(form).catch(() => {});
  }
}

/** Field-level validateDeps registry: dep key → dependents listing it
 * (WeakMap — Form shape untouched). */
const fieldValidateDeps = new WeakMap<Form, Map<string, Set<string>>>();

/** Register one field's deps: `key` re-validates when any path in
 * `depKeys` changes. Idempotent per pair — StrictMode's double effect is
 * harmless. */
export function registerFieldValidateDeps(
  form: Form,
  key: string,
  depKeys: string[]
): void {
  const deps = getOrCreate(fieldValidateDeps, form, () => new Map());
  for (const depKey of depKeys) {
    const dependents = deps.get(depKey) ?? new Set<string>();
    dependents.add(key);
    deps.set(depKey, dependents);
  }
}

/** Drop one field's deps registration; empty entries are removed so the
 * registry never outlives its fields. */
export function unregisterFieldValidateDeps(
  form: Form,
  key: string,
  depKeys: string[]
): void {
  const deps = fieldValidateDeps.get(form);
  if (!deps) return;
  for (const depKey of depKeys) {
    const dependents = deps.get(depKey);
    if (!dependents?.delete(key)) continue;
    if (!dependents.size) deps.delete(depKey);
  }
}

/**
 * Field-level twin: after a user change to `path`, re-run every field
 * validator that declared it as a dep. Same channel and gate as
 * {@link revalidateFormOnChange} — the dependent's own error arms
 * reValidateMode, and a passing re-run replaces it (a field validator
 * owns its whole key). Ordinary validator kicks: the dependent's
 * debounce applies, sync throws propagate. A no-op unless some field
 * declared `path` as a dep.
 */
export function revalidateDependentsOnChange(
  form: Form,
  path: Path,
  mode: ValidationMode
): void {
  const dependents = fieldValidateDeps.get(form)?.get(path.key);
  if (!dependents?.size) return;
  for (const dependent of dependents) {
    // A self-dep: the field's own onChange already validated it.
    if (dependent === path.key) continue;
    if (
      shouldKick(
        mode,
        'onChange',
        hasTouchedByPath(form, path),
        () => form.errors.has(dependent),
        form.reValidateMode
      )
    ) {
      form.validators.get(dependent)?.();
    }
  }
}

/** {@link ensureValidate}'s rejection: `message` is the first error's
 * display text; `.errors` carries the full flattened list ({@link
 * getErrors}) for branching without re-reading the form. */
export type FormValidationError = Error & {errors: FieldErrorEntry[]};

function validationError(form: Form): FormValidationError {
  const error = new Error(getFirstError(form)) as FormValidationError;
  error.errors = getErrors(form);
  return error;
}

/**
 * Validate and throw if any field error.
 * @param form
 * @return resolve if no error; reject and stop validate if has an error
 */
export async function ensureValidate(form: Form): Promise<void> {
  form.validators.forEach(validator => validator());

  await waitUntil(
    form.emitter,
    'validating',
    () => fieldsSettled(form),
    () => hasErrors(form)
  ).catch(() => {
    throw validationError(form);
  });

  if (form.validate) {
    await runFormValidate(form);
    if (hasErrors(form)) throw validationError(form);
  }
}

/**
 * Validate and return if any field error.
 * @param form
 * @return error message string or void
 */
export async function validate(form: Form): Promise<void | string> {
  return ensureValidate(form).catch(e => e.message);
}
