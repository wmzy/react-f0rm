import {useContext, useEffect, useState} from 'react';
import type {Context} from 'react';
import {FormContext} from '../context';
import {
  getValueByPath,
  hasTouchedByPath,
  registerFieldValidateDeps,
  removeFieldByPath,
  revalidateDependentsOnChange,
  revalidateFormOnChange,
  setTouchedByPath,
  setValueByPath,
  unregisterFieldValidateDeps
} from '../form';
import type {FieldError, Form, ValidationMode} from '../form';
import createPath from '../path';
import type {Name} from '../path';
import type {FieldPath, PathValueOf} from '../types';
import {rulesToValidator} from '../rules';
import type {FieldRules} from '../rules';
import {useFieldErrorsByPath, useValueByPath, useWatch} from './form';
import usePath from './path';
import useValidate from './validate';
import type {Validator} from './validate';
import {useStageFn} from './stage';
import {isPromise} from '../util';

/** Dev-only flag, replaced at build time (rollup.config.js `replace`);
 * defined for the test environment in vitest.config.ts. */
declare const __DEV__: boolean;

export interface UseFieldOptions<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
> {
  form?: Form<TValues>;
  name: TPath;
  initialValue?: any;
  shouldUnregister?: boolean;
  validate?: Validator;
  /**
   * Declarative rules (required/min/max/minLength/maxLength/pattern),
   * compiled into a validator that runs before `validate` — both sources'
   * errors merge into one FieldError[], rules errors ahead. Failures land
   * in the form's error state with the given or default messages.
   */
  rules?: FieldRules;
  /**
   * Milliseconds to debounce this field's validation kicks. Defaults to 0
   * (validate immediately); while the timer is pending the field counts as
   * validating, so `trigger`/`ensureValidate` wait out the window. Only the
   * last kick inside the window runs the validator.
   */
  validateDebounce?: number;
  /**
   * Milliseconds to delay showing a newly appearing error in the render
   * layer (`error`/`errorObject`/`errors` stay undefined/empty until the
   * window passes). The form's error state is never delayed — trigger,
   * submit and `getError` read it immediately. An error that clears inside
   * the window never shows; once an error is visible, later changes apply
   * immediately. Only the none → some transition waits.
   */
  delayError?: number;
  /**
   * Disable this field: OR-ed with the form-level flag
   * (`createForm({disabled})` / `setDisabled`) into the result's
   * `disabled`. A field cannot opt out of a disabled form.
   */
  disabled?: boolean;
  /**
   * Field-level validation mode override: when given, this field validates
   * on its own schedule instead of `form.mode` — every other field keeps
   * the form-level timing (e.g. a form that defaults to `'onSubmit'` with
   * one field declared `'onBlur'` shows that field's error on blur while
   * the rest wait for submit). `reValidateMode` stays form-level: once any
   * field has an error (after a failed submit, say), re-validation follows
   * the form's `reValidateMode` for every field, overriding this one too.
   * See {@link ValidationMode}.
   */
  mode?: ValidationMode;
  /**
   * Field paths whose **user changes re-run this field's validator** —
   * the field-level counterpart of the form-level `validateDeps` option
   * (cross-field linkage: `password` changed → re-check
   * `passwordConfirm`). TanStack Form's `onChangeListenTo` / RHF trigger
   * chains are the ecosystem analogues.
   *
   * The re-run rides the changed field's own onChange pipeline, so typing
   * and `changeValue` both fire it while programmatic `setValue` does
   * not, and its timing is gated by the same mode matrix as the form
   * level: the changed field's effective `mode` (per-field override
   * included) and the form's `reValidateMode` — under the default
   * `'onSubmit'`/`'onChange'` pair, a dep change re-validates this field
   * once this field already shows an error (the submit-then-fix flow: the
   * mismatch lands on submit, editing the password re-checks the confirm
   * and a passing round clears the error, because a field validator owns
   * its whole key).
   *
   * `validateDebounce` applies to the re-run like to any kick. Declaring
   * the field's own path is a no-op (its own change already validates it).
   */
  validateDeps?: FieldPath<TValues>[];
}

/**
 * The result of {@link useField}. Deliberately a closed shape: no index
 * signature, so a typo'd property access (`field.vlaue`) is a type error
 * instead of silently reading `undefined`.
 */
export interface UseFieldResult<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
> {
  /** The form instance this field is bound to (explicit prop or context) —
   * handy for consumers that need direct access to the headless API. */
  form: Form<TValues>;
  value: PathValueOf<TValues, TPath>;
  /** Error message string (FieldError#message) for display, or undefined */
  error: string | undefined;
  /** Full FieldError object ({type, message}), or undefined */
  errorObject: FieldError | undefined;
  /** Every error registered for the field, in insertion order — `error`
   * and `errorObject` are its first entry. Empty (and reference-stable)
   * when the field has no errors. */
  errors: FieldError[];
  onChange: (v: any) => void;
  onBlur: () => void;
  name: string;
  /** Merged disabled flag: the form-level flag (`createForm({disabled})`
   * toggled by `setDisabled`) OR-ed with this field's own `disabled`
   * option, updated live through the form's event core. */
  disabled: boolean;
}

/**
 * Compose declarative rules with a user validator: rules run first, then
 * the user's validator (awaited when async), and the results merge into
 * one error list with rules errors ahead. Either side may be absent —
 * the other passes through untouched. Errors are returned as an array (or
 * undefined when both sides pass), which setErrorByPath stores as-is.
 */
function combineRulesAndValidate(
  rules: FieldRules | undefined,
  validate: Validator | undefined
): Validator | undefined {
  if (!rules) return validate;
  const ruleValidator = rulesToValidator(rules);
  if (!validate) return ruleValidator;
  return (value, meta) => {
    // rulesToValidator's contract is FieldError[] | undefined; the wider
    // Validator union here is only its declared type.
    const ruleErrors = ruleValidator(value, meta) as FieldError[] | undefined;
    const merge = (
      other: string | FieldError | (string | FieldError)[] | undefined
    ): (string | FieldError)[] | undefined => {
      const list: (string | FieldError)[] = [...(ruleErrors ?? [])];
      if (Array.isArray(other)) list.push(...other);
      else if (other) list.push(other);
      return list.length ? list : undefined;
    };
    const result = validate(value, meta);
    return isPromise(result) ? result.then(merge) : merge(result);
  };
}

/**
 * Render-layer gating for {@link UseFieldOptions}.delayError: hold a newly
 * appearing error back for `delay` ms while the form's error state stays
 * immediate. Only the none → some transition waits — an error that clears
 * inside the window never shows, and once an error is visible, later
 * changes (a new message, entries added or removed) apply immediately.
 * With `delay === undefined` the subscription value passes through
 * untouched: no timers and no state writes, so fields that do not opt in
 * pay nothing beyond the hook calls themselves.
 */
function useDelayedErrors(
  errors: FieldError[],
  delay: number | undefined
): FieldError[] {
  const [shown, setShown] = useState<FieldError[]>(errors);
  useEffect(() => {
    if (delay === undefined) return;
    // Clearing is always immediate: an error cleared inside the window is
    // cancelled before ever showing, a shown one hides at once (errors is
    // the shared empty constant on this branch).
    if (errors.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 取消窗口是设计行为：清空必须立刻生效
      setShown(errors);
      return;
    }
    // Already showing an error: swaps and list changes apply at once.
    if (shown.length > 0) {
      setShown(errors);
      return;
    }
    // Appearing from none: wait out the window. The cleanup clears the
    // timer when errors change again or the field unmounts.
    const timer = setTimeout(() => setShown(errors), delay);
    return () => clearTimeout(timer);
  }, [errors, delay, shown]);
  return delay === undefined ? errors : shown;
}

/**
 * Shared core of {@link useField} and the per-instance hooks returned by
 * `createFormContext()`: identical behavior, but the form is resolved from
 * whichever Context instance is passed in instead of the module-level one.
 *
 * `form` is always handed to `useValidate` explicitly, and an explicit form
 * wins over `useValidate`'s own context read — so scoped contexts need no
 * changes there.
 */
export function useFieldCore<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
>(
  {
    form: f1,
    name,
    initialValue,
    shouldUnregister,
    validate,
    rules,
    validateDebounce,
    validateDeps,
    delayError,
    disabled,
    mode: modeOption
  }: UseFieldOptions<TValues, TPath>,
  Context: Context<any>
): UseFieldResult<TValues, TPath> {
  // Read the context unconditionally (hook call order must be stable), then
  // let an explicitly passed form win — works without a <FormProvider>.
  const contextForm = useContext(Context);
  const form = f1 || contextForm;
  if (!form) throw new Error('no form provided');
  const path = usePath(name);

  // Undeclared options are dropped on purpose: the return value carries
  // only the fields declared on UseFieldResult, so nothing rides it back
  // onto DOM elements through a component's prop spread.
  const validator = useValidate(
    combineRulesAndValidate(rules, validate),
    path,
    form,
    {
      debounce: validateDebounce
    }
  );

  // All errors of the field through one subscription; the array reference
  // is stable (stored array or shared empty constant), so consumers can
  // memo on it. delayError gates only this render-layer view of the list;
  // the live list keeps driving the reValidateMode kicks below.
  const liveErrors = useFieldErrorsByPath(form, path);
  const errors = useDelayedErrors(liveErrors, delayError);
  const errorObject = errors[0];
  const error = errorObject?.message;
  const value = useValueByPath(form, path);

  // The form-level disabled flag, subscribed so setDisabled re-renders
  // this field; the field's own option is OR-ed in on every render.
  const formDisabled = useWatch(form.emitter, 'disabled', () => form.disabled);

  // A field-declared mode replaces the form-level one for this field only;
  // the reValidateMode kicks below stay form-level for every field.
  const mode = modeOption ?? form.mode;

  // Seed initialValue in an effect (never during render, so no 'change' is
  // emitted while rendering) and only when the field has no value yet, so
  // user input survives re-renders and remounts.
  useEffect(() => {
    if (initialValue === undefined) return;
    if (getValueByPath(form, path) === undefined) {
      setValueByPath(form, path, initialValue);
    }
  }, [form, path, initialValue]);

  const onChange = useStageFn((v: any) => {
    setValueByPath(form, path, v);
    // The live (ungated) error drives the reValidate kick: an error hidden
    // inside the delayError window still counts as "has an error", so
    // typing re-validates and can clear it before it ever shows.
    if (
      mode === 'onChange' ||
      mode === 'all' ||
      (mode === 'onTouched' && hasTouchedByPath(form, path)) ||
      (liveErrors.length > 0 && form.reValidateMode === 'onChange')
    )
      validator();
    // Form-level validate deps: a user change to a listed field re-runs
    // the form-level validate under the same mode/reValidateMode gating
    // above (evaluated against the last round's own error footprint).
    // No-op for forms without validateDeps.
    revalidateFormOnChange(form, path, mode);
    // Field-level validate deps: fields that declared this path re-run
    // their own validators under the same gate. No-op when nobody
    // declared the path.
    revalidateDependentsOnChange(form, path, mode);
  });

  // Publish this field's change semantics so path-based user-change writes
  // (changeValue / changeValueByPath) route through the exact same gated
  // pipeline as a user typing into the field. Component-library bridges
  // cannot rebuild the gate from public state: the effective per-field
  // mode and the live-error view are closed over above. Identity of the
  // staged fn is stable and its closure always latest, so one registration
  // per mount suffices.
  useEffect(() => {
    // Two fields mounted at the same path compete for the changeHandler
    // slot last-wins: from here on every changeValue write routes to the
    // latest mount, so the earlier field's mode/reValidateMode gating
    // silently stops applying. That is almost always a bug (a stray
    // duplicate name, a remount racing the old instance) — say so in DEV.
    if (__DEV__ && form.changeHandlers.has(path.key)) {
      // eslint-disable-next-line no-console -- the whole point of this branch
      console.warn(
        `react-f0rm: two fields are mounted at the same path ${path.key}. ` +
          `The latest mount's change handler owns the slot, so changeValue ` +
          `writes route to it and the earlier field's validation mode no ` +
          `longer applies. Use distinct names if both must stay mounted.`
      );
    }
    form.changeHandlers.set(path.key, onChange);
    return () => {
      // Guard: a later mount on the same path may own the slot now — only
      // remove our own registration.
      if (form.changeHandlers.get(path.key) === onChange)
        form.changeHandlers.delete(path.key);
    };
  }, [form, path.key, onChange]);

  // Publish this field's validateDeps declaration so the dep fields'
  // change pipelines can find it (revalidateDependentsOnChange). Keyed on
  // the serialized dep list, so a re-render passing an equal inline array
  // does not churn the registry; a genuinely changed list re-registers.
  const depsKey = validateDeps?.length ? validateDeps.join('\n') : undefined;
  useEffect(() => {
    if (!depsKey) return;
    const depKeys = validateDeps!.map(dep => createPath(dep).key);
    registerFieldValidateDeps(form, path.key, depKeys);
    return () => unregisterFieldValidateDeps(form, path.key, depKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are `depsKey` on purpose: depKeys derive from the same option value the key serializes
  }, [form, path.key, depsKey]);

  const onBlur = useStageFn(() => {
    setTouchedByPath(form, path);
    if (
      mode === 'onBlur' ||
      mode === 'onTouched' ||
      mode === 'all' ||
      (liveErrors.length > 0 && form.reValidateMode === 'onBlur')
    )
      validator();
  });

  useEffect(
    () => () => {
      if (shouldUnregister !== false) {
        removeFieldByPath(form, path);
      }
    },
    [path, form, shouldUnregister]
  );

  return {
    form,
    value,
    error,
    errorObject,
    errors,
    onChange,
    onBlur,
    name: path.key,
    disabled: formDisabled || !!disabled
  };
}

export default function useField<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
>(options: UseFieldOptions<TValues, TPath>): UseFieldResult<TValues, TPath> {
  return useFieldCore(options, FormContext);
}
