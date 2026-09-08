import {emit} from '../emitter';
import createPath from '../path';
import type {Name, Path, PathSegments} from '../path';
import {isIndex, isPromise, normalizePath, waitUntil} from '../util';
import type {
  FieldError,
  FieldErrorEntry,
  Form,
  ValidationMode,
  ValidateResult,
  ValidationOutcome
} from '../form';
import {
  VALIDATION_OUTCOME,
  getErrors,
  getFirstError,
  hasErrors,
  setError,
  setErrorByPath
} from './errors';
import {hasTouchedByPath, setTouchedByPath} from './touched';
import {getValueByPath, getValues} from './values';
import {isFieldError, isSegmentsPath, setParsedValues} from './internals';

export function unsetValidatingByPath(
  {emitter, validating}: Form,
  path: Path
): void {
  validating.delete(path.key);
  // Path payload lets key-scoped subscribers (onKeyEvent) skip unrelated
  // fields; payload-less listeners ignore it.
  emit(emitter, 'validating', path);
}

export function setValidatingByPath(
  {emitter, validating}: Form,
  path: Path
): void {
  validating.add(path.key);
  emit(emitter, 'validating', path);
}

/**
 * Field validator. Returns an error (a string, a FieldError, or an array
 * mixing both) or undefined when valid; may return a Promise for async
 * validation.
 *
 * The second argument carries the validation context. `meta.signal` is
 * aborted as soon as the round is superseded — a newer round started, or
 * the field unregistered — so async validators can cancel their underlying
 * work (fetch, timers) instead of racing a stale result home. Stale
 * results are dropped independently by the registration's lock
 * ({@link registerValidatorByPath}), so validators that ignore the signal
 * stay correct too. Validators written against the older two-argument
 * signature keep working.
 */
export type Validator = (
  value: any,
  meta: {form: Form; path: Path; signal: AbortSignal}
) =>
  | string
  | FieldError
  | (string | FieldError)[]
  | undefined
  | Promise<string | FieldError | (string | FieldError)[] | undefined>;

/**
 * Synchronous pre-validator for {@link registerValidatorByPath}'s `sync`
 * accessor — declarative `required` rules compiled by `rulesToValidator`
 * in practice, but any sync-only check works. Runs on every kick, never
 * debounced: its errors land immediately and, while present,
 * short-circuit the debounced validator for that kick (the expensive
 * check never sees a value the gate already rejects). Must be synchronous
 * — unlike a {@link Validator} it may not return a Promise — and its meta
 * carries no `signal`: there is nothing to abort in a synchronous check.
 */
export type SyncValidator = (
  value: any,
  meta: {form: Form; path: Path}
) => string | FieldError | (string | FieldError)[] | undefined;

/** Live options for {@link registerValidatorByPath}: read at every kick
 * through accessors, so callers (React's `useValidate`) can swap the
 * validator/debounce/sync-gate per render without re-subscribing the
 * registration mid-flight. */
export type ValidatorRegistration = {
  /** Current debounced validator (or undefined — a sync-only
   * registration). */
  validate: () => Validator | undefined;
  /** Debounce delay in milliseconds; 0 (default) runs immediately. */
  debounce: () => number;
  /** Synchronous pre-validator, run on every kick (never debounced). */
  sync: () => SyncValidator | undefined;
};

/**
 * Register a field validator's kick at `path` in {@link Form.validators}
 * — the framework-free machinery behind `useValidate`. Returns a
 * disposer that drops the registration and cancels any pending debounce
 * window or in-flight round (its signal aborts and its validating mark
 * is released).
 *
 * Contract of the registered kick (the same contract `trigger` /
 * `ensureValidate` rely on when they run every entry, and the
 * user-change gate relies on when it runs the changed path's entry):
 * - the `sync` gate runs immediately on every kick — never debounced —
 *   and while it returns errors, the debounced validator is skipped for
 *   that kick and any pending window or in-flight round is superseded;
 * - a positive `debounce` merges kicks inside the window: only the last
 *   one runs the validator, and while the timer is pending the field
 *   counts as validating so `trigger`/`ensureValidate` wait it out;
 * - async results land under a lock: a superseded round's outcome —
 *   rejection included — is dropped, and only the owning round releases
 *   the validating mark;
 * - a synchronous throw inside the validator propagates to the caller
 *   (the validating mark is not left stuck behind it).
 *
 * Registering at a path already registered by another mount replaces it
 * (last-wins, the historical `useValidate` behavior); the disposer drops
 * its own registration unconditionally.
 *
 * @param form
 * @param path
 * @param registration live validator/debounce/sync accessors
 * @return disposer: unregister and cancel pending work
 */
export function registerValidatorByPath(
  form: Form,
  path: Path,
  registration: ValidatorRegistration
): () => void {
  // The pending debounce timer and the current round's controller live in
  // this closure so the disposer below can cancel them.
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  // Whether this registration currently holds the path's slot in
  // form.validating. The mark is taken when a debounce window opens or an
  // async round starts, and released by whichever round settles last —
  // including a later sync round that supersedes an in-flight async one
  // (its own .finally is lock-gated out by then).
  let marked = false;
  // The async-round lock: only the latest round may land its result or
  // release the mark; a superseded round's outcome is dropped wholesale.
  let lock: object | null = null;
  // Which source wrote the error currently on display — the sync gate or
  // the debounced validator. Tracked so a passing sync check can clear
  // its own stale error immediately instead of leaving it on screen until
  // the debounced round lands. External writers (setError, form-level
  // validate) are invisible here; a passing round clearing them matches
  // the long-standing "a field validator owns its whole key" contract.
  let errorSource: 'sync' | 'validator' | null = null;
  /** Does a validator result land errors? `[]` normalizes away exactly
   * like undefined in setErrorByPath. */
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

  /** Run the synchronous gate on the field's current value. Its errors
   * land immediately — the gate is never debounced. Returns true when
   * errors landed (the kick's whole outcome for the debounced validator).
   * A passing gate clears the field's errors when they were its own from
   * an earlier kick, or when no debounced validator exists to own the
   * round. */
  const runSync = (): boolean => {
    const sync = registration.sync();
    if (!sync) return false;
    const errors = sync(getValueByPath(form, path), {form, path});
    if (!hasErrors(errors)) {
      // A stale error the gate itself wrote is answered by the gate
      // alone; a rules-only registration's passing check is the whole
      // round. With a debounced validator registered, its upcoming round
      // owns the outcome and lands it later.
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

  /** Drop any pending window or in-flight round without landing it: the
   * sync gate now owns the outcome, so the debounced validator must not
   * run for this value. */
  const supersede = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    controller?.abort();
    lock = {};
  };

  /** Run the debounced validator on the field's current value and land
   * its result — the sync gate has already passed. */
  const runValidator = () => {
    const fn = registration.validate();
    if (!fn) {
      unmark();
      return;
    }
    // Abort the superseded round's signal: a listening validator should
    // stop its underlying work. The lock refresh below independently
    // drops any result that still arrives, signal or not.
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
      setErrorByPath(form, path, result);
      errorSource = hasErrors(result) ? 'validator' : null;
      // Error first, then release the mark: 'validating' subscribers
      // (trigger) re-read state on wake and must see the landed error.
      unmark();
      return;
    }
    mark();
    result
      .then(
        (error: string | FieldError | (string | FieldError)[] | undefined) => {
          if (lock === round) {
            setErrorByPath(form, path, error);
            errorSource = hasErrors(error) ? 'validator' : null;
          }
        }
      )
      // A rejected round is the normal way a signal-listening validator
      // gives up (fetch throws AbortError once aborted); swallow it and
      // let the owning round write the outcome.
      .catch(() => {})
      .finally(() => {
        if (lock === round) {
          unmark();
          lock = null;
        }
      });
  };

  /** A debounce window fired: the value may have drifted since the last
   * kick (programmatic writes do not kick validators), so re-run the
   * sync gate before spending the debounced validator on a value the
   * gate already rejects. */
  const run = () => {
    timer = null;
    if (runSync()) {
      supersede();
      unmark();
      return;
    }
    runValidator();
  };

  const kick = () => {
    if (runSync()) {
      supersede();
      unmark();
      return;
    }
    if (!registration.validate()) return;
    const debounce = registration.debounce();
    if (debounce > 0) {
      // Only the last kick inside the window runs: restart the timer on
      // every kick. The mark keeps trigger/ensureValidate's
      // validating-set wait covering the pending timer, not just
      // in-flight promises.
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

/**
 * Set field error
 * @param form
 * @param name
 * @param error string is normalized to {type: 'custom', message}; a
 *        FieldError object is stored as-is; an array holds several errors
 *        (falsy items dropped, strings normalized); undefined clears
 */
/** Options accepted by {@link trigger}. `shouldTouch` defaults to `false`;
 * omitting the options object entirely keeps the plain validate-only
 * behavior, so the historical two-argument calls are untouched. */
export type TriggerOptions = {
  /** Mark every path in the triggered scope as touched — even when
   * validation fails — once the round settles. Mirrors react-hook-form's
   * trigger `shouldTouch`. Defaults to `false`. */
  shouldTouch?: boolean;
  /**
   * Focus the first errored field in the triggered scope once the round
   * settles (and only when the round left errors) — react-hook-form's
   * trigger `shouldFocus` counterpart. Rides the 'focusError' event
   * channel like a failed submit's auto-focus: only mounted bound fields
   * react, unmounted ones are silent no-ops. Without `name` the first key
   * of the errors Map wins (the same rule handleSubmit applies); with
   * `name` the first errored triggered key does. Defaults to `false`.
   */
  shouldFocus?: boolean;
};

/**
 * Trigger field validation.
 *
 * Without `name` every registered field validator runs. A single `name` —
 * dotted string or segments array — runs only that field's validator, and
 * an array of names runs each one in order. An empty array is a no-op, as
 * is any name with no registered validator. An array argument counts as
 * one segments path only when it mixes in numbers (`['items', 0]`); pure
 * string arrays are name lists, so `['a', 'b']` triggers fields `a` and
 * `b`, not the nested path `a.b`.
 *
 * `options.shouldTouch` marks the triggered scope — the given names, or
 * every registered field when `name` is omitted — as touched after the
 * round settles, whether validation passed or failed. The wait/settle
 * logic is untouched: the marking rides on top of the settled round, so
 * subscribers observe errors and touched together rather than mid-flight.
 *
 * The returned promise waits for the triggered validation to settle —
 * async validators included — so their errors have already landed in
 * `form.errors` when it resolves. It never rejects: landing errors is the
 * expected outcome here, not a failure. Resolves `true` when the triggered
 * scope is error-free, `false` otherwise. Without `name` the scope is all
 * fields plus the form-level `validate` result (which runs after field
 * validators settle, same pipeline as {@link ensureValidate}); with `name`
 * only those fields' own errors count and form-level `validate` is
 * skipped (RHF semantics).
 *
 * Fire-and-forget callers may ignore the promise: the validator kicks
 * still happen synchronously, matching the pre-promise behavior.
 *
 * @param form
 * @param name field name(s) to trigger, or all fields when omitted
 * @param options extra behavior toggles ({@link TriggerOptions}); omitted,
 *        validation alone runs — no touched marking
 * @return whether the triggered scope is error-free once validation settles
 */
export async function trigger(
  form: Form,
  name?: Name | Name[],
  options?: TriggerOptions
): Promise<boolean> {
  // Never reject (an error landing is a normal outcome, not a failure), so
  // waitUntil's isReject is permanently false. Without a name the wait is
  // deliberately conservative — every FIELD validator, unrelated in-flight
  // ones included, because the round covers the whole form (and the
  // form-level validate's own window is excluded via fieldsSettled —
  // callers wait that out through the kick's promise instead, so a pending
  // window never gates the next kick). With a name the wait narrows to the
  // triggered keys only: a slow async validator on field B must not hold
  // trigger('a') hostage when the round never reads B.
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

  if (name === undefined) {
    form.validators.forEach(validator => validator());
    await settle();
    if (form.validate) await runFormValidate(form);
    // shouldTouch marks the whole registered scope — every key the round
    // could have validated — pass or fail alike.
    if (options?.shouldTouch) touchKeys(form, [...form.validators.keys()]);
    // First error across the errors Map — the same rule a failed submit's
    // auto-focus applies (a form-level error may land first; it has no
    // element, so it is a silent no-op like every unbound path).
    if (options?.shouldFocus) {
      const firstKey = form.errors.keys().next().value;
      if (firstKey !== undefined) emit(form.emitter, 'focusError', firstKey);
    }
    return !hasErrors(form);
  }

  const keys: string[] =
    typeof name === 'string' || isSegmentsPath(name)
      ? [createPath(name).key]
      : name.map(one => createPath(one).key);
  keys.forEach(key => form.validators.get(key)?.());
  await settle(keys);
  if (options?.shouldTouch) touchKeys(form, keys);
  // Focus the first errored key among the triggered scope — trigger('a')
  // never focuses B's pre-existing error.
  if (options?.shouldFocus) {
    const firstKey = keys.find(key => form.errors.has(key));
    if (firstKey !== undefined) emit(form.emitter, 'focusError', firstKey);
  }
  return keys.every(key => !form.errors.has(key));
}

/** trigger's `shouldTouch` marking: touch every key in the triggered scope
 * through {@link setTouchedByPath}, which no-ops on already-touched keys
 * and emits the path-carrying 'touched' event per newly touched one. Keys
 * are the stored JSON-stringified segments shape, so parse them back into
 * Path — normalizePath passes segment arrays through untouched, making the
 * key round-trip exact. */
function touchKeys(form: Form, keys: string[]): void {
  keys.forEach(key => setTouchedByPath(form, createPath(JSON.parse(key))));
}

/**
 * Flatten a form-level validate result and write each leaf error through
 * setError. Nested objects descend into deeper paths ({a: {b: 'msg'}} sets
 * the 'a.b' error), array values contribute every non-empty string they
 * hold as separate errors (zod flatten() formErrors style), and
 * FieldError-shaped objects are stored as-is. Falsy values are skipped.
 *
 * When `footprint` is passed (validateDeps forms only), every leaf this
 * round actually stored is recorded into it — the exact stored array —
 * so the next round can drop exactly what this one wrote.
 */
function setFormErrors(
  form: Form,
  result: Record<string, any>,
  segments: PathSegments = [],
  footprint?: Map<string, FieldError[]>
): void {
  Object.entries(result).forEach(([key, value]) => {
    // Error-tree keys are explicit object keys, not path expressions:
    // a numeric key ('0' — Standard Schema issue paths stringify array
    // indices) stays a literal string segment instead of feeding the
    // path parser, whose dotted-numeric rule governs path strings only.
    const path: PathSegments = [
      ...segments,
      ...(isIndex(key) ? [key] : normalizePath(key))
    ];
    if (typeof value === 'string') {
      if (value) {
        setError(form, path, value);
        recordFootprint(form, path, footprint);
      }
    } else if (Array.isArray(value)) {
      setError(form, path, value);
      recordFootprint(form, path, footprint);
    } else if (isFieldError(value)) {
      setError(form, path, value);
      recordFootprint(form, path, footprint);
    } else if (value && typeof value === 'object') {
      setFormErrors(form, value, path, footprint);
    }
  });
}

/** Record one leaf write of a form-level validate round: the path key and
 * the exact array now stored there. Nothing is recorded when the write
 * normalized away (all-empty arrays) — there is no error to own. The
 * stored array is read back from the errors Map because setErrorByPath
 * owns normalization. */
function recordFootprint(
  form: Form,
  segments: PathSegments,
  footprint: Map<string, FieldError[]> | undefined
): void {
  if (!footprint) return;
  const path = createPath(segments);
  const stored = form.errors.get(path.key);
  if (stored) footprint.set(path.key, stored);
}

/**
 * Land a form-level validate result. A plain record keeps the
 * long-standing behavior — flattened into field errors by
 * {@link setFormErrors}. A branded {@link ValidationOutcome} splits
 * instead: `errors` flattens exactly like a plain record, and `values`
 * (the schema's parsed output — coerced/transformed values included)
 * becomes the form's parsedValues baseline. Falsy results are skipped,
 * branded or not.
 *
 * Forms that opted into `validateDeps` additionally get round-scoped
 * error ownership: before the new result lands, the errors the previous
 * round wrote are dropped ({@link clearFormValidateErrors}), so a re-run
 * that passes makes the cross-field error disappear — and the new
 * round's own writes become the tracked footprint. Forms without the
 * option keep the historical write-only behavior untouched.
 */
function applyValidateResult(
  form: Form,
  result: ValidateResult<any> | undefined
): void {
  const footprint = form.validateDeps ? getFormErrorFootprint(form) : undefined;
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

/** Per-form error footprint of the last form-level validate round: every
 * path key it flattened onto, with the exact array instance it stored.
 * Tracked only for forms that opted into `validateDeps` — held in a
 * WeakMap so the Form shape and the non-opted pipeline stay untouched. */
const formErrorFootprints = new WeakMap<Form, Map<string, FieldError[]>>();

function getFormErrorFootprint(form: Form): Map<string, FieldError[]> {
  let footprint = formErrorFootprints.get(form);
  if (!footprint) {
    footprint = new Map();
    formErrorFootprints.set(form, footprint);
  }
  return footprint;
}

/** Does the form still show an error the last form-level round wrote?
 * Compared by identity, not key membership: once a field validator,
 * `setServerErrors`, a manual `setError` or `clearErrors` replaces the
 * stored array, that error is no longer the round's to own — neither the
 * dep-change gate nor the next round's clearing may touch it. */
function hasFormValidateErrors(form: Form): boolean {
  const footprint = formErrorFootprints.get(form);
  if (!footprint) return false;
  for (const [key, written] of footprint) {
    if (form.errors.get(key) === written) return true;
  }
  return false;
}

/** Drop the last form-level round's errors before the next round lands.
 * Per key the stored array is identity-checked — an error overwritten or
 * cleared by anyone else in between survives — and each drop emits the
 * same path-payload 'errors' event {@link setErrorByPath} would, so
 * subscribed fields re-render exactly like on any error write. */
function clearFormValidateErrors(
  form: Form,
  footprint: Map<string, FieldError[]>
): void {
  for (const [key, written] of footprint) {
    const stored = form.errors.get(key);
    if (stored !== written) continue;
    form.errors.delete(key);
    emit(form.emitter, 'errors', createPath(JSON.parse(key)));
  }
}

/** Key the form-level validate round reserves in `form.validating` while
 * its debounce window is pending or its async round is in flight. Real
 * path keys are JSON-stringified segments (always bracketed), so a bare
 * word can never collide. */
const FORM_VALIDATING_KEY = '__form_validate__';

/** Are all FIELD validation rounds drained? trigger/ensureValidate wait on
 * this before kicking the form-level validate (its errors gate whether the
 * form-level round may run at all). The form validate's own reserved key
 * is deliberately excluded: its window is waited out through the kick's
 * returned promise instead, so a pending window or in-flight form round
 * never gates the next kick — a kick during an in-flight round opens a
 * new window and the newer round supersedes, mirroring the per-field
 * `validateDebounce` contract. */
function fieldsSettled(form: Form): boolean {
  for (const key of form.validating) {
    if (key !== FORM_VALIDATING_KEY) return false;
  }
  return true;
}

/** Sentinel telling {@link settleFormValidate} the round landed cleanly —
 * distinct from every rejection payload, including `undefined`. */
const SETTLED = Symbol('form-validate-settled');

/** Per-form bookkeeping for the debounced form-level validate: the
 * pending window timer, the in-flight round, and the waiters merged into
 * the current window group. Held in a WeakMap so the Form instance shape
 * is untouched for forms that never set `validateDebounce`. */
type FormValidateState = {
  timer: ReturnType<typeof setTimeout> | null;
  controller: AbortController | null;
  /** Identity of the in-flight round; a superseded round's outcome
   * (rejection included) is dropped by comparing against it. */
  round: object | null;
  /** Whether this state currently holds FORM_VALIDATING_KEY in
   * form.validating. */
  marked: boolean;
  waiters: Array<{resolve: () => void; reject: (error: unknown) => void}>;
};

const formValidateStates = new WeakMap<Form, FormValidateState>();

function getFormValidateState(form: Form): FormValidateState {
  let state = formValidateStates.get(form);
  if (!state) {
    state = {
      timer: null,
      controller: null,
      round: null,
      marked: false,
      waiters: []
    };
    formValidateStates.set(form, state);
  }
  return state;
}

/**
 * Run the form-level `validate` and land its result, honoring the form's
 * `validateDebounce` option.
 *
 * Undebounced (`0`/undefined) the caller's await *is* the validate call —
 * the long-standing pipeline, unchanged: no validating mark, no round
 * gating, immediate values snapshot, rejection propagating to the caller.
 *
 * Debounced, the kick opens (or restarts — kicks inside the window merge)
 * a window during which the form counts as validating, so `trigger` /
 * `ensureValidate` / submit wait the window out exactly like a field's
 * `validateDebounce` window. When the timer fires, the round reads the
 * then-current values, supersedes (aborts) any in-flight round, and lands
 * its result. The returned promise settles once the window group's final
 * round has landed — rejecting when that round's validate callback threw
 * or its promise rejected, mirroring the undebounced propagation — so
 * merged callers all observe the same outcome.
 *
 * Only called under `if (form.validate)`.
 */
function runFormValidate(form: Form): Promise<void> {
  const validate = form.validate;
  if (!validate) return Promise.resolve();
  const debounce = form.validateDebounce ?? 0;
  if (debounce <= 0) {
    // Standalone controller: nothing supersedes an undebounced call, so
    // its signal never fires — it exists for argument-shape parity with
    // the debounced rounds (and with field-level meta.signal).
    const controller = new AbortController();
    return Promise.resolve(
      validate(getValues(form), {form, signal: controller.signal})
    ).then(result => {
      applyValidateResult(form, result);
    });
  }
  const state = getFormValidateState(form);
  // (Re)open the window: a kick while the timer is pending restarts it
  // (only the last kick's values run); one while a round is in flight
  // keeps the validating mark held and defers to the new window's round.
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

/** Run one form-level validate round with the form's current values.
 * Aborts the previous in-flight round's signal; a superseded round's
 * outcome — rejection included — is dropped by the round gate, exactly
 * like the field-level lock. */
function runFormValidateRound(
  form: Form,
  state: FormValidateState,
  round: object
): Promise<void> {
  const validate = form.validate;
  if (!validate) return Promise.resolve();
  state.controller?.abort();
  const controller = (state.controller = new AbortController());
  let outcome: Promise<any>;
  try {
    outcome = Promise.resolve(
      validate(getValues(form), {form, signal: controller.signal})
    );
  } catch (error) {
    outcome = Promise.reject(error);
  }
  return outcome.then(
    result => {
      if (state.round === round) applyValidateResult(form, result);
    },
    error => {
      if (state.round === round) throw error;
    }
  );
}

/** Land the window group's outcome: release the validating mark — after
 * the round's errors/values have already landed, because 'validating'
 * subscribers (trigger, ensureValidate) re-read state on wake — and
 * settle every merged waiter. A superseded round never lands here (the
 * newer round owns the release), and a window that re-opened while the
 * round was in flight defers: the mark and the waiters carry over to the
 * pending timer's round. */
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

/**
 * Form-level twin of the gated validator kick in `useField`'s onChange:
 * re-run the form-level `validate` after a user change to a field listed
 * in `validateDeps`. Called from the field's own change pipeline (typing
 * and `changeValue` alike — both route through the mounted field's
 * onChange), so programmatic `setValue` writes do not re-run it, exactly
 * like they do not re-run field validators.
 *
 * The gate mirrors the per-field matrix with the *changed field's*
 * effective `mode` (a per-field override governs when its changes may
 * fire validation) and the form-level `reValidateMode` against the last
 * round's error footprint ({@link hasFormValidateErrors} — field
 * validators' errors never arm this kick):
 * - `mode` `'onChange'`/`'all'` — every dep change re-runs;
 * - `mode` `'onTouched'` — dep changes re-run once the field was touched;
 * - otherwise the re-run waits for `reValidateMode: 'onChange'` (the
 *   default) while the last round's error is still live — the
 *   submit-then-fix flow: the mismatch lands on submit, editing the
 *   dependency re-runs the validate and clears it.
 * `reValidateMode: 'onBlur'`/`'onSubmit'` never re-run on a change (a
 * change is not a blur; submit re-runs are the submit pipeline's job).
 *
 * The kick is fire-and-forget: async round rejections are swallowed
 * (nothing in an event handler can await them), while a synchronous
 * throw inside the validate callback propagates to the caller exactly
 * like a field validator's does.
 *
 * A no-op unless the form set `validateDeps` listing `path` — forms
 * without the option pay one property check here.
 */
export function revalidateFormOnChange(
  form: Form,
  path: Path,
  mode: ValidationMode
): void {
  if (!form.validateDeps?.has(path.key) || !form.validate) return;
  if (
    mode === 'onChange' ||
    mode === 'all' ||
    (mode === 'onTouched' && hasTouchedByPath(form, path)) ||
    (form.reValidateMode === 'onChange' && hasFormValidateErrors(form))
  ) {
    runFormValidate(form).catch(() => {});
  }
}

/** Per-form registry of field-level `validateDeps` declarations ({@link
 * revalidateDependentsOnChange}): dep path key -> every dependent field key
 * that listed it. Held in a WeakMap so the Form shape is untouched for
 * forms whose fields never declare deps. */
const fieldValidateDeps = new WeakMap<Form, Map<string, Set<string>>>();

/** Register one field's validateDeps declaration: `key` re-validates when
 * any path in `depKeys` takes a user change. Idempotent per (key, dep)
 * pair, so StrictMode's double effect is harmless. */
export function registerFieldValidateDeps(
  form: Form,
  key: string,
  depKeys: string[]
): void {
  let deps = fieldValidateDeps.get(form);
  if (!deps) {
    deps = new Map();
    fieldValidateDeps.set(form, deps);
  }
  for (const depKey of depKeys) {
    let dependents = deps.get(depKey);
    if (!dependents) {
      dependents = new Set();
      deps.set(depKey, dependents);
    }
    dependents.add(key);
  }
}

/** Drop one field's validateDeps registration ({@link
 * registerFieldValidateDeps}). Entries nobody lists anymore are removed so
 * the registry never outlives its fields. */
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
 * Field-level twin of {@link revalidateFormOnChange}: after a user change
 * to `path`, re-run every field validator that declared `path` in its
 * `validateDeps` (useField option). Same channel, same gate: the kick
 * rides the changed field's own onChange pipeline (typing and
 * `changeValue` alike), so programmatic `setValue` writes never fire it —
 * exactly like field validators and the form-level `validateDeps`.
 *
 * The gate mirrors the form-level matrix with the *changed field's*
 * effective `mode` and the form-level `reValidateMode` against each
 * dependent's live error:
 * - `mode` `'onChange'`/`'all'` — every dep change re-runs the dependent;
 * - `mode` `'onTouched'` — once the changed field was touched;
 * - otherwise the re-run waits for `reValidateMode: 'onChange'` (the
 *   default) while the dependent still shows an error — the
 *   submit-then-fix flow: the mismatch lands on submit, editing the
 *   dependency re-validates the dependent and a passing round clears it
 *   (a field validator owns its whole key, so the re-run's result
 *   replaces whatever the previous round wrote — the field-level shape
 *   of the form-level footprint reclaim).
 *
 * The kick is an ordinary validator kick: the dependent's own
 * `validateDebounce` window applies, and a synchronous throw inside its
 * validate propagates to the caller like any field validator's would.
 *
 * A no-op unless some field declared `path` as a dep — forms without any
 * field-level `validateDeps` pay one property check here.
 */
export function revalidateDependentsOnChange(
  form: Form,
  path: Path,
  mode: ValidationMode
): void {
  const dependents = fieldValidateDeps.get(form)?.get(path.key);
  if (!dependents?.size) return;
  for (const dependent of dependents) {
    // A self-dep changes nothing: the field's own onChange above already
    // validated it under the same gate.
    if (dependent === path.key) continue;
    if (
      mode === 'onChange' ||
      mode === 'all' ||
      (mode === 'onTouched' && hasTouchedByPath(form, path)) ||
      (form.reValidateMode === 'onChange' && form.errors.has(dependent))
    ) {
      form.validators.get(dependent)?.();
    }
  }
}

/** The Error {@link ensureValidate} rejects with: `message` is the first
 * error's display text ({@link getFirstError}) — the long-standing shape
 * — and `.errors` carries the complete flattened error list ({@link
 * getErrors}: `{path, type, message}` entries, dotted display paths) so
 * catchers can branch on types and locate fields without re-reading the
 * form. */
export type FormValidationError = Error & {errors: FieldErrorEntry[]};

/** Build {@link ensureValidate}'s rejection: first error's message, every
 * error attached. */
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
