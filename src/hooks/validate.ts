import {useContext, useEffect, useRef} from 'react';
import {FormContext} from '../context';
import {
  getValueByPath,
  setErrorByPath,
  setValidatingByPath,
  unsetValidatingByPath
} from '../form';
import type {FieldError, Form} from '../form';
import type {Path} from '../path';
import {useStageFn} from './stage';
import {isPromise} from '../util';

/**
 * Field validator. Returns an error (a string, a FieldError, or an array
 * mixing both) or undefined when valid; may return a Promise for async
 * validation.
 *
 * The second argument carries the validation context. `meta.signal` is
 * aborted as soon as the round is superseded — a newer round started, or
 * the field unregistered — so async validators can cancel their underlying
 * work (fetch, timers) instead of racing a stale result home. Stale
 * results are dropped independently by useValidate's lock, so validators
 * that ignore the signal stay correct too. Validators written against the
 * older two-argument signature keep working.
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
 * Synchronous pre-validator for {@link useValidate}'s `sync` option —
 * declarative `required` rules compiled by `rulesToValidator` in practice,
 * but any sync-only check works. Runs on every kick, never debounced: its
 * errors land immediately and, while present, short-circuit the debounced
 * validator for that kick (the expensive check never sees a value the gate
 * already rejects). Must be synchronous — unlike a {@link Validator} it
 * may not return a Promise — and its meta carries no `signal`: there is
 * nothing to abort in a synchronous check.
 */
export type SyncValidator = (
  value: any,
  meta: {form: Form; path: Path}
) => string | FieldError | (string | FieldError)[] | undefined;

/** Options for {@link useValidate}. */
export type UseValidateOptions = {
  /**
   * Delay in milliseconds before a validation kick actually runs the
   * debounced validator. `0` (default) runs immediately; a positive value
   * debounces rapid kicks (e.g. typing) so only the last one executes.
   * While the timer is pending the field counts as validating, so
   * `trigger` / `ensureValidate` wait out the window. The `sync`
   * pre-validator is exempt: it runs immediately on every kick and never
   * waits out the window.
   */
  debounce?: number;
  /**
   * Synchronous pre-validator run immediately on every kick — never
   * debounced. While it returns errors, the debounced `validate` is
   * skipped for that kick (its errors land and the expensive check never
   * runs), and any pending debounce window or in-flight round is
   * superseded. When it passes, a stale error it produced earlier clears
   * at once, and a registration with no `validate` treats the passing
   * check as the whole round and clears the field's errors.
   */
  sync?: SyncValidator;
};

export default function useValidate(
  validate: Validator | undefined,
  path: Path,
  formProp?: Form,
  options?: UseValidateOptions
): () => void {
  // Read the context unconditionally (hook call order must be stable), then
  // let an explicitly passed form win — works without a <FormProvider>.
  const contextForm = useContext(FormContext);
  const form = formProp || contextForm;
  if (!form) throw new Error('no form provided');
  const lockRef = useRef<object | null>(null);
  const validateRef = useRef(validate);
  validateRef.current = validate;
  // Read the delay through a ref (like validateRef) so changing it doesn't
  // re-subscribe the validator mid-flight.
  const debounceRef = useRef(options?.debounce ?? 0);
  debounceRef.current = options?.debounce ?? 0;
  // The synchronous gate is read through a ref too: field rules recompile
  // every render and must not re-subscribe the validator mid-flight.
  const syncRef = useRef(options?.sync);
  syncRef.current = options?.sync;

  useEffect(() => {
    // The pending debounce timer and the current round's controller live in
    // this closure so the cleanup below can cancel them.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    // Whether this registration currently holds the path's slot in
    // form.validating. The mark is taken when a debounce window opens or an
    // async round starts, and released by whichever round settles last —
    // including a later sync round that supersedes an in-flight async one
    // (its own .finally is lock-gated out by then).
    let marked = false;
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
      const sync = syncRef.current;
      if (!sync) return false;
      const errors = sync(getValueByPath(form, path), {form, path});
      if (!hasErrors(errors)) {
        // A stale error the gate itself wrote is answered by the gate
        // alone; a rules-only registration's passing check is the whole
        // round. With a debounced validator registered, its upcoming round
        // owns the outcome and lands it later.
        if (!validateRef.current || errorSource === 'sync') {
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
      lockRef.current = {};
    };

    /** Run the debounced validator on the field's current value and land
     * its result — the sync gate has already passed. */
    const runValidator = () => {
      const fn = validateRef.current;
      if (!fn) {
        unmark();
        return;
      }
      // Abort the superseded round's signal: a listening validator should
      // stop its underlying work. The lock refresh below independently
      // drops any result that still arrives, signal or not.
      controller?.abort();
      controller = new AbortController();
      const lock = (lockRef.current = {});
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
          (
            error: string | FieldError | (string | FieldError)[] | undefined
          ) => {
            if (lock === lockRef.current) {
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
          if (lock === lockRef.current) {
            unmark();
            lockRef.current = null;
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

    const validator = () => {
      if (runSync()) {
        supersede();
        unmark();
        return;
      }
      if (!validateRef.current) return;
      const debounce = debounceRef.current;
      if (debounce > 0) {
        // Only the last kick inside the window runs: restart the timer on
        // every kick. The mark keeps trigger/ensureValidate's validating-set
        // wait covering the pending timer, not just in-flight promises.
        if (timer !== null) clearTimeout(timer);
        else mark();
        timer = setTimeout(run, debounce);
        return;
      }
      runValidator();
    };

    form.validators.set(path.key, validator);
    return () => {
      form.validators.delete(path.key);
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      unmark();
      controller?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are `path.key` on purpose: usePath returns a stable Path per key, so re-subscribing on key (not object identity) is enough
  }, [form, path.key]);

  return useStageFn(() => form.validators.get(path.key)?.());
}
