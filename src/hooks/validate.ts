import {useContext, useEffect} from 'react';
import {on} from '../emitter';
import {FormContext} from '../context';
import {registerValidatorByPath} from '../form';
import type {Form, SyncValidator, Validator} from '../form';
import type {Path} from '../path';
import type {FieldRules} from '../rules';
import {hasStandardProps, schemaToFieldValidator} from '../standardSchema';
import type {StandardSchemaV1} from '../standardSchema';
import {pathFromKey} from './path';
import useStage, {useStageFn} from './stage';

// The validator contract itself is framework-free and lives in the core
// (`src/form.ts`); re-exported here so historical imports keep working.
export type {SyncValidator, Validator};

/** Option spellings shared across the field, field-array and validator
 * hooks — private to the hooks slice, never part of the public facade. */
export type FieldOptionBase = {
  /** Declarative rules compiled into a sync validator. */
  rules?: FieldRules;
  /** Whether unmounting removes the branch; defaults to the form-level
   * `shouldUnregister` (tombstone). `false` keeps the values. */
  shouldUnregister?: boolean;
  /** Keep the debounced validator running when the sync gate failed
   * (TanStack `asyncAlways`): gate errors land immediately, the
   * validator's result lands alongside them per-source. */
  asyncAlways?: boolean;
  /** Validate once on mount (overrides the form-level flag in either
   * direction). Deferred while async `initialValues` is pending. */
  validateOnMount?: boolean;
};

/**
 * Options for {@link useValidate}: the registration machinery (debounce
 * window, async-round lock, signal abort, validating mark) lives in the
 * core's {@link registerValidatorByPath}; this hook wires its React
 * lifecycle — register on mount, dispose on unmount, read options live
 * through refs so re-renders never re-subscribe.
 */
export type UseValidateOptions = Pick<
  FieldOptionBase,
  'asyncAlways' | 'validateOnMount'
> & {
  /** Milliseconds to debounce this validator's kicks; `0` (default) runs
   * immediately, and the field counts as validating while the window is
   * pending. The `sync` pre-validator is exempt. */
  debounce?: number;
  /** Synchronous pre-validator run on every kick, never debounced; while
   * it fails, the debounced validator is skipped and pending work is
   * superseded. A passing check clears its own stale error. */
  sync?: SyncValidator;
};

/** Coerce a `validate` option that may be a Standard Schema into a plain
 * validator — a plain validator passes through, `undefined` stays. */
export function schemaAsValidator(
  validate: Validator | StandardSchemaV1<any, any> | undefined
): Validator | undefined {
  return validate && hasStandardProps(validate)
    ? schemaToFieldValidator(validate as StandardSchemaV1<any, any>)
    : (validate as Validator | undefined);
}

/**
 * Register a field validator and return its kick (debounce + sync gate
 * applied) — stored in `form.validators` for `trigger`/`ensureValidate`
 * and the user-change gate. The machinery lives in the core's
 * {@link registerValidatorByPath}; this is its React binding.
 */
export default function useValidate(
  validate: Validator | StandardSchemaV1<any, any> | undefined,
  path: Path,
  formProp?: Form,
  options?: UseValidateOptions
): () => void {
  // Unconditional context read keeps hook order stable; an explicit form
  // wins (no <FormProvider> needed).
  const contextForm = useContext(FormContext);
  const form = formProp || contextForm;
  if (!form) throw new Error('no form provided');
  // Live accessors: the registration always sees the latest
  // validator/debounce/sync-gate, so per-render swaps never re-subscribe.
  // A Standard Schema is wrapped into a validator here.
  const validateRef = useStage(schemaAsValidator(validate));
  const debounceRef = useStage(options?.debounce ?? 0);
  const syncRef = useStage(options?.sync);
  const asyncAlwaysRef = useStage(options?.asyncAlways ?? false);
  // Same live-ref pattern: the effect keys on [form, path.key], so the
  // option read must not appear in its closure (it would re-run the
  // registration per render).
  const validateOnMountRef = useStage(options?.validateOnMount);

  useEffect(() => {
    const spath = pathFromKey(path.key);
    const dispose = registerValidatorByPath(form, spath, {
      validate: () => validateRef.current,
      debounce: () => debounceRef.current,
      sync: () => syncRef.current,
      asyncAlways: () => asyncAlwaysRef.current
    });
    // Kick once after the registration lands (own option over form-level).
    // Validator-less registrations never kick — an empty kick would clear
    // a stored server error.
    const validateOnMount = validateOnMountRef.current ?? form.validateOnMount;
    if (!validateOnMount || (!validateRef.current && !syncRef.current)) {
      return dispose;
    }
    // A deferred kick must never fire after disposal (unmount, or
    // StrictMode's setup→cleanup→setup remount); the flag drops it.
    let disposed = false;
    const kick = () => {
      if (disposed) return;
      form.validators.get(path.key)?.();
    };
    if (!form.isLoading) {
      kick();
    } else {
      // Async initialValues pending: 'loading' fires after the resolved
      // baseline lands, so the kick validates real values.
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
    validateRef,
    validateOnMountRef
  ]);

  return useStageFn(() => form.validators.get(path.key)?.());
}
