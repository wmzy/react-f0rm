import {useCallback, useContext, useEffect, useRef, useState} from 'react';
import type {Context} from 'react';
import {on} from '@for-fun/event-emitter';
import {FormContext} from '../context';
import {
  emitChangeByPath,
  getValueByPath,
  registerFieldMode,
  registerFieldValidateDeps,
  removeFieldByPath,
  seedValueByPath,
  unregisterFieldMode,
  unregisterFieldValidateDeps,
  userBlur,
  userChangeByPath
} from '../form';
import type {FieldError, Form, ValidationMode} from '../form';
import createPath from '../path';
import type {Path, PathSegments} from '../path';
import type {FieldPath, PathValueOf} from '../types';
import {rulesToValidator} from '../rules';
import type {FieldRules} from '../rules';
import {useFieldErrorsByPath, useWatch, useWatchCore} from './form';
import {onPathEvent} from '../subscribe';
import usePath from './path';
import useValidate from './validate';
import type {Validator} from './validate';
import {useStageFn} from './stage';
import {isPromise} from '../util';

/** Dev-only flag, replaced at build time (rollup.config.js `replace`);
 * defined for the test environment in vitest.config.ts. */
declare const __DEV__: boolean;

export type UseFieldOptions<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments
> = {
  form?: Form<TValues>;
  name: TPath;
  initialValue?: any;
  shouldUnregister?: boolean;
  validate?: Validator;
  /**
   * Declarative rules (required/min/max/minLength/maxLength/pattern),
   * compiled into a synchronous validator. `required` is special: it runs
   * immediately on every kick — never debounced — and while it fails,
   * `validate` is skipped (the expensive check never sees an empty value).
   * The other rules compose with `validate` — rules run first, then
   * `validate` (awaited when async), merging both sources' errors with
   * rules errors ahead. Failures land in the form's error state with the
   * given or default messages.
   */
  rules?: FieldRules;
  /**
   * Milliseconds to debounce this field's validation kicks. Defaults to 0
   * (validate immediately); while the timer is pending the field counts as
   * validating, so `trigger`/`ensureValidate` wait out the window. Only the
   * last kick inside the window runs the validator. The `required` rule is
   * exempt: it runs synchronously on every kick, so a required failure
   * shows immediately instead of waiting out the window.
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
   * Uncontrolled mode: the field never subscribes to its own value, so
   * typing re-renders nothing — the store still carries every write
   * (getValues/submit/validation read it), and errors/touched/disabled/
   * validating still re-render the field like react-hook-form's
   * `register`. The result's `value` is the mount-time snapshot (initial
   * value seed or baseline); reset/setInitialValues do not push into it
   * or into the DOM — read live values with useValue/getValues instead.
   * Attach the result with `<input defaultValue={field.value}>`-style
   * binding (no `value` prop), exactly like <Field uncontrolled /> does.
   */
  uncontrolled?: boolean;
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
};

/**
 * The result of {@link useField}. Deliberately a closed shape: no index
 * signature, so a typo'd property access (`field.vlaue`) is a type error
 * instead of silently reading `undefined`.
 */
export type UseFieldResult<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments
> = {
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
  /**
   * Callback ref carrying the focus channel: attach it to your input
   * element (`<input ref={field.focusRef} />`) so `setFocus` and a failed
   * submit's first-error auto-focus (`shouldFocusError`) can focus this
   * headless field — the same 'focusError' wiring `<Field>` performs for
   * its own input. Without it, focus requests aimed at this field are
   * silent no-ops, matching `setFocus`'s contract: focusing a field
   * whose element is not bound neither throws nor focuses anything.
   */
  focusRef: (el: any) => void;
};

/** Does `rules` declare any constraint? `messages` alone does not
 * validate anything, and a constraint-free object would otherwise compile
 * into a validator that always passes — which would still open debounce
 * windows and hold the validating mark for nothing. */
function hasRuleConstraints(rules: FieldRules): boolean {
  return (
    rules.required !== undefined ||
    rules.min !== undefined ||
    rules.max !== undefined ||
    rules.minLength !== undefined ||
    rules.maxLength !== undefined ||
    rules.pattern !== undefined
  );
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
  if (!rules || !hasRuleConstraints(rules)) return validate;
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
 * Value snapshot for {@link useFieldCore}. Controlled fields subscribe to
 * 'change' at their own path (leaf scope) and track the store live.
 * Uncontrolled fields instead pin the value read at mount: no change
 * subscription, so typing re-renders nothing while the store still carries
 * every write (getValues/submit/validation read it). Errors, touched,
 * disabled and validating stay subscribed, so state-driven re-renders
 * behave like react-hook-form's `register`. The pinned snapshot is
 * deliberately never refreshed — reset/setInitialValues do not push into
 * it (or into a `defaultValue`-bound DOM element).
 */
function useFieldValue(form: Form, path: Path, uncontrolled: boolean): any {
  const snapshotRef = useRef<{has: boolean; value: any}>({
    has: false,
    value: undefined
  });
  const getter = useCallback(() => {
    if (!uncontrolled) return getValueByPath(form, path);
    if (!snapshotRef.current.has) {
      snapshotRef.current = {has: true, value: getValueByPath(form, path)};
    }
    return snapshotRef.current.value;
  }, [uncontrolled, form, path]);
  const subscribeFactory = useCallback(
    (invalidate: () => void) =>
      uncontrolled
        ? () => {}
        : onPathEvent(form.emitter, 'change', path, 'leaf', invalidate),
    [uncontrolled, form.emitter, path]
  );
  return useWatchCore(subscribeFactory, getter);
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
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments
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
    uncontrolled,
    mode: modeOption
  }: UseFieldOptions<TValues, TPath>,
  Context: Context<Form<any> | null>
): UseFieldResult<TValues, TPath> {
  // Read the context unconditionally (hook call order must be stable), then
  // let an explicitly passed form win — works without a <FormProvider>.
  const contextForm = useContext(Context);
  const form = f1 || contextForm;
  if (!form) throw new Error('no form provided');
  const path = usePath(name);

  // Seed initialValue during render, not in an effect: the first paint
  // (SSR included — effects never run on the server) must already carry
  // the value, so the write lands here — before the value subscription
  // below takes its first snapshot. The write is emit-free (see
  // seedValueByPath) because emitting while rendering is illegal; the
  // post-commit effect announces it. The `=== undefined` guard keeps user
  // input and committed values safe across re-renders and remounts.
  const seededRef = useRef(false);
  const seeded =
    initialValue !== undefined && getValueByPath(form, path) === undefined;
  if (seeded) {
    seedValueByPath(form, path, initialValue);
    // Sticky until the announce effect consumes it, so StrictMode's second
    // render (which sees the value already seeded) still announces once.
    seededRef.current = true;
  }
  useEffect(() => {
    // Dep-less on purpose: the seed can land on a later render too (a
    // setInitialValues/reset wiped it; the guard re-seeds), and the
    // announcement must follow every actual seed. The flag makes the
    // steady state a cheap check.
    if (!seededRef.current) return;
    seededRef.current = false;
    // Wake path-scoped subscribers that rendered before this field in an
    // earlier commit — their snapshots predate the seed. Same-commit
    // subscribers self-heal through useSyncExternalStore's post-subscribe
    // snapshot check, and subscribers that already saw the seeded value
    // re-read an unchanged snapshot and bail out.
    emitChangeByPath(form, path);
  });

  // Undeclared options are dropped on purpose: the return value carries
  // only the fields declared on UseFieldResult, so nothing rides it back
  // onto DOM elements through a component's prop spread.
  //
  // `required` splits off into useValidate's synchronous gate: it runs
  // immediately on every kick (never debounced) and, while it fails, the
  // debounced validator is skipped — the other rules and `validate` never
  // see an empty value. The remaining rules still compose with `validate`
  // inside the debounced validator.
  const restRules: FieldRules | undefined = rules
    ? {...rules, required: undefined}
    : undefined;
  useValidate(combineRulesAndValidate(restRules, validate), path, form, {
    debounce: validateDebounce,
    sync:
      rules && rules.required !== undefined
        ? rulesToValidator({required: rules.required})
        : undefined
  });

  // All errors of the field through one subscription; the array reference
  // is stable (stored array or shared empty constant), so consumers can
  // memo on it. delayError gates only this render-layer view of the list;
  // the stored list keeps driving the reValidateMode kicks inside the
  // core's user-change gate.
  const liveErrors = useFieldErrorsByPath(form, path);
  const errors = useDelayedErrors(liveErrors, delayError);
  const errorObject = errors[0];
  const error = errorObject?.message;
  const value = useFieldValue(form, path, !!uncontrolled);

  // The form-level disabled flag, subscribed so setDisabled re-renders
  // this field; the field's own option is OR-ed in on every render.
  const formDisabled = useWatch(form, 'disabled', () => form.disabled);

  // The user-change pipeline lives in the core: onChange forwards to
  // userChangeByPath (write + mode/reValidateMode-gated validation, the
  // matrix registered below through registerFieldMode), onBlur to
  // userBlur (touched marking + blur-side gate). The stage keeps the
  // handler identities stable across re-renders.
  const onChange = useStageFn((v: any) => userChangeByPath(form, path, v));
  const onBlur = useStageFn(() => userBlur(form, path));

  // Register this field's validation-mode override so path-based
  // user-change writes (changeValue / changeValueByPath) route through
  // the same gated core pipeline as a user typing into the field.
  // Two fields mounted at the same path compete for the slot last-wins:
  // from here on every user-change write gates on the latest mount's
  // mode. That is almost always a bug (a stray duplicate name, a remount
  // racing the old instance) — say so in DEV.
  useEffect(() => {
    const {token, displaced} = registerFieldMode(form, path, modeOption);
    if (__DEV__ && displaced) {
      // eslint-disable-next-line no-console -- the whole point of this branch
      console.warn(
        `react-f0rm: two fields are mounted at the same path ${path.key}. ` +
          `The latest mount's mode registration owns the slot, so changeValue ` +
          `writes gate on it and the earlier field's validation mode no ` +
          `longer applies. Use distinct names if both must stay mounted.`
      );
    }
    return () => unregisterFieldMode(form, path, token);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are `path.key` on purpose: usePath memoizes the Path per key, so re-registering on key (not object identity) is enough
  }, [form, path.key, modeOption]);

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

  // The focus channel. 'focusError' carries the target's path key —
  // emitted by handleSubmit's failed round (the first error's key, gated
  // by shouldFocusError) and by setFocus (with an optional
  // {shouldSelect} second argument). Subscribing here rather than inside
  // <Field> means headless useField consumers get focus support by
  // attaching focusRef; <Field> merely forwards it through its merged
  // ref. The callback ref is identity-stable, so re-renders never detach
  // the element, and the null guard keeps unbound fields silent no-ops.
  const elementRef = useRef<any>(null);
  const focusRef = useCallback((el: any) => {
    elementRef.current = el;
  }, []);
  useEffect(
    () =>
      on(
        form.emitter,
        'focusError',
        (key: string, options?: {shouldSelect?: boolean}) => {
          if (key !== path.key) return;
          const el = elementRef.current;
          if (!el || typeof el.focus !== 'function') return;
          el.focus();
          if (options?.shouldSelect && typeof el.select === 'function') {
            el.select();
          }
        }
      ),
    [form, path.key]
  );

  useEffect(
    () => () => {
      // Effective unmount behavior: the field's own option, falling back
      // to the form-level default, then to this library's historical
      // default (tombstone).
      if ((shouldUnregister ?? form.shouldUnregister) !== false) {
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
    disabled: formDisabled || !!disabled,
    focusRef
  };
}

export default function useField<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments
>(options: UseFieldOptions<TValues, TPath>): UseFieldResult<TValues, TPath> {
  return useFieldCore(options, FormContext);
}
