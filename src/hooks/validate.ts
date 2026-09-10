import {useContext, useEffect, useRef} from 'react';
import {on} from '../emitter';
import {FormContext} from '../context';
import {registerValidatorByPath} from '../form';
import type {Form, SyncValidator, Validator} from '../form';
import type {Path} from '../path';
import {hasStandardProps, schemaToFieldValidator} from '../standardSchema';
import type {StandardSchemaV1} from '../standardSchema';
import {pathFromKey} from './path';
import useStage, {useStageFn} from './stage';

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
  /**
   * Run the debounced validator even when the `sync` gate failed —
   * TanStack Form's `asyncAlways`. The gate's errors land immediately
   * (never debounced) and the validator's own result lands alongside
   * them, per-source: a passing async round clears only its own errors,
   * the gate's verdict stays until the gate itself passes. Defaults to
   * false (gate failure owns the kick's outcome).
   */
  asyncAlways?: boolean;
  /**
   * Validate on mount: kick the registration once after it lands (Formik's
   * `validateOnMount` / TanStack Form's per-field flag). Falls back to the
   * form-level `createForm({validateOnMount})` when omitted, so a field
   * opts out with `validateOnMount: false`. Validator-less registrations
   * never kick on mount — an empty kick would clear a server error that
   * landed before the field mounted. While an async `initialValues` source
   * is still pending the kick is deferred until the resolved baseline
   * lands (validating the empty shell would land spurious required
   * errors); a field unmounted in between never kicks.
   */
  validateOnMount?: boolean;
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
  validate: Validator | StandardSchemaV1 | undefined,
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
  // mid-flight. A Standard Schema passed straight to `validate` is
  // wrapped into a validator here — same treatment the core gives
  // `createForm({validate: schema})`.
  const validateOption = validate;
  const validateRef = useRef<Validator | undefined>(undefined);
  validateRef.current =
    validateOption && hasStandardProps(validateOption)
      ? schemaToFieldValidator(validateOption as StandardSchemaV1<any, any>)
      : (validateOption as Validator | undefined);
  const debounceRef = useStage(options?.debounce ?? 0);
  const syncRef = useStage(options?.sync);
  const asyncAlwaysRef = useStage(options?.asyncAlways ?? false);
  // Same live-ref pattern: the effect keys on [form, path.key], so the
  // option read must not appear in its closure — or it would demand a dep
  // that re-runs the registration on every options object.
  const validateOnMountRef = useStage(options?.validateOnMount);

  useEffect(() => {
    const spath = pathFromKey(path.key);
    const dispose = registerValidatorByPath(form, spath, {
      validate: () => validateRef.current,
      debounce: () => debounceRef.current,
      sync: () => syncRef.current,
      asyncAlways: () => asyncAlwaysRef.current
    });
    // Mount validation: kick the registration once after it lands. The
    // field's own option wins over the form-level flag in either
    // direction. Validator-less registrations never kick — an empty kick
    // clears whatever error was already stored at the path (a server
    // backfill that landed before mount, say).
    const validateOnMount = validateOnMountRef.current ?? form.validateOnMount;
    if (!validateOnMount || (!validateRef.current && !syncRef.current)) {
      return dispose;
    }
    // A deferred kick must never fire after this mount's registration was
    // disposed (unmount, or StrictMode's setup→cleanup→setup remount): the
    // flag drops it, and a remounted field's own setup schedules its kick.
    let disposed = false;
    const kick = () => {
      if (disposed) return;
      form.validators.get(path.key)?.();
    };
    if (!form.isLoading) {
      kick();
    } else {
      // Async initialValues pending: the 'loading' event fires after the
      // resolved baseline has landed (setInitialValues first), so the kick
      // validates real values instead of the empty shell.
      const off = on(form.emitter, 'loading', () => {
        off();
        kick();
      });
    }
    return () => {
      disposed = true;
      dispose();
    };
  }, [
    form,
    path.key,
    debounceRef,
    syncRef,
    asyncAlwaysRef,
    validateOnMountRef
  ]);

  return useStageFn(() => form.validators.get(path.key)?.());
}
