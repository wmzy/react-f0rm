import {useContext, useEffect, useRef} from 'react';
import {FormContext} from '../context';
import {registerValidatorByPath} from '../form';
import type {Form, SyncValidator, Validator} from '../form';
import type {Path} from '../path';
import {useStageFn} from './stage';

// The validator contract itself is framework-free and lives in the core
// (`src/form.ts`); re-exported here so historical imports keep working.
export type {SyncValidator, Validator};

/**
 * Options for {@link useValidate} — the React-side registration of a field
 * validator. The registration machinery (debounce window, async-round
 * lock, signal abort, validating mark) lives in the core's
 * {@link registerValidatorByPath}; this hook only wires its React
 * lifecycle around it: register on mount, dispose on unmount, and read
 * the validator/debounce/sync-gate live through refs so re-renders never
 * re-subscribe the registration mid-flight.
 */
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

/**
 * Register a field validator with the form and return its kick — a stable
 * function that validates the field's current value (debounce and sync
 * gate applied). The returned function is the one stored in
 * `form.validators`; `trigger`/`ensureValidate` run every stored kick,
 * and the field's user-change gate runs the changed path's kick. This is
 * the old "useValidate" behavior — the same public shape with the
 * machinery moved into the core, so non-React adapters can register
 * validators directly through `registerValidatorByPath`.
 */
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
  // Live accessors: the registration must always see the latest
  // validator/debounce/sync-gate, so swapping them per render (inline
  // validators, recompiled rules) never re-subscribes the registration
  // mid-flight.
  const validateRef = useRef(validate);
  validateRef.current = validate;
  const debounceRef = useRef(options?.debounce ?? 0);
  debounceRef.current = options?.debounce ?? 0;
  const syncRef = useRef(options?.sync);
  syncRef.current = options?.sync;

  useEffect(
    () =>
      registerValidatorByPath(form, path, {
        validate: () => validateRef.current,
        debounce: () => debounceRef.current,
        sync: () => syncRef.current
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are `path.key` on purpose: usePath returns a stable Path per key, so re-subscribing on key (not object identity) is enough
    [form, path.key]
  );

  return useStageFn(() => form.validators.get(path.key)?.());
}
