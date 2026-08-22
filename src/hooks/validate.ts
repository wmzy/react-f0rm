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

/** Options for {@link useValidate}. */
export interface UseValidateOptions {
  /**
   * Delay in milliseconds before a validation kick actually runs the
   * validator. `0` (default) runs immediately; a positive value debounces
   * rapid kicks (e.g. typing) so only the last one executes. While the
   * timer is pending the field counts as validating, so `trigger` /
   * `ensureValidate` wait out the window.
   */
  debounce?: number;
}

export default function useValidate(
  validate: Validator | undefined,
  path: Path,
  formProp?: Form,
  options?: UseValidateOptions
): () => void {
  // Read the context unconditionally (hook call order must be stable), then
  // let an explicitly passed form win — works without a <FormProvider>.
  const contextForm = useContext(FormContext);
  const form = (formProp || contextForm) as Form;
  if (!form) throw new Error('no form provided');
  const lockRef = useRef<object | null>(null);
  const validateRef = useRef(validate);
  validateRef.current = validate;
  // Read the delay through a ref (like validateRef) so changing it doesn't
  // re-subscribe the validator mid-flight.
  const debounceRef = useRef(options?.debounce ?? 0);
  debounceRef.current = options?.debounce ?? 0;

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

    const run = () => {
      timer = null;
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

    const validator = () => {
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
      run();
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
