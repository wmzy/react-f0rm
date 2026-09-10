import {useCallback, useContext, useEffect, useRef} from 'react';
import type {Context} from 'react';
import {on} from '../emitter';
import {FormContext} from '../context';
import {
  emitChangeByPath,
  getFieldErrorsByPath,
  getValueByPath,
  isFieldDirtyByPath,
  registerFieldMode,
  registerFieldValidateDeps,
  seedValueByPath,
  unregisterFieldMode,
  unregisterFieldValidateDeps,
  userBlur,
  userChangeByPath
} from '../form';
import type {FieldError, Form, ValidationMode} from '../form';
import createPath from '../path';
import type {Path, PathSegments} from '../path';
import type {StandardSchemaV1} from '../standardSchema';
import {hasStandardProps, schemaToFieldValidator} from '../standardSchema';
import type {FieldPath, PathValueOf} from '../types';
import {hasRuleConstraints, rulesToValidator} from '../rules';
import type {FieldRules} from '../rules';
import {errorIdFromKey} from '../errorId';
import {extractEventValue, isPromise} from '../util';
import {
  hasDisabledAncestor,
  registerFieldDisabled,
  unregisterFieldDisabled
} from '../core/disabled';
import {useWatchCore} from './form';
import {onKeyEvent, onPathEvent} from '../subscribe';
import usePath from './path';
import useValidate from './validate';
import type {Validator} from './validate';
import {removeFieldForUnmount, restoreRemovedField} from '../core/unmount';
import type {RemovedFieldSnapshot} from '../core/unmount';
import useStage, {useStageFn, useUnmountRestore} from './stage';

/** Dev-only flag, replaced at build time (rollup.config.js `replace`);
 * defined for the test environment in vitest.config.ts. */
declare const __DEV__: boolean;

/** Module-private registry driving uncontrolled fields' DOM sync — one
 * 'change' listener per form (see the sync effect in {@link
 * useFieldCore}), the same module-scope registry pattern
 * `arrayIdsRegistry` uses in fieldArray.ts. Per-form cells map a field's
 * path key to a reader of its bound element and path; the shared listener
 * iterates them only on payload-less (bulk) emits. */
type UncontrolledSyncEntry = {
  cells: Map<string, () => {el: any; path: Path}>;
  off: () => void;
};
const uncontrolledSyncRegistry = new WeakMap<Form, UncontrolledSyncEntry>();

export type UseFieldOptions<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments
> = {
  form?: Form<TValues>;
  name: TPath;
  initialValue?: any;
  shouldUnregister?: boolean;
  /**
   * Field-level validator. The value argument follows the path: with a
   * typed form the callback receives `PathValueOf<TValues, TPath>` (the
   * TanStack-parity inference — `name: 'age'` on a `{age: number}` shape
   * types `value` as `number`), and falls back to `any` for untyped call
   * sites (segment arrays, dynamic names). The return shape mirrors
   * {@link Validator} — an error (string / FieldError / mixed array) or
   * undefined when valid, possibly a Promise for async validation. The
   * second argument carries the validation context (`meta.signal` aborts
   * when the round is superseded).
   */
  validate?:
    | ((
        value: PathValueOf<TValues, TPath>,
        meta: {form: Form<TValues>; path: Path; signal: AbortSignal}
      ) => ReturnType<Validator>)
    | StandardSchemaV1<PathValueOf<TValues, TPath>>;
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
   * Run this field's debounced validator even when its `required` gate
   * failed — TanStack Form's `asyncAlways`. The gate's errors land
   * immediately (never debounced) and the validator's own result lands
   * alongside them, per-source: a passing async round clears only its
   * own errors while the gate's verdict stays. Falls back to the
   * form-level `createForm({asyncAlways})` flag when omitted, so a field
   * opts out with `asyncAlways: false`. The use case: the cheap format
   * check fails (gate) but the expensive backend check should still run
   * ("not in the right shape — and the backend says taken, too").
   */
  asyncAlways?: boolean;
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
   * Disable this field: merged into the result's `disabled` as
   * `form.disabled || own === true || (own !== false && an ancestor
   * declared disabled)`. `disabled: true` on a parent path disables every
   * descendant field too (react-hook-form subtree semantics), and a
   * descendant declares `disabled: false` to opt back out of that
   * ancestor. The form-level flag (`createForm({disabled})` /
   * `setDisabled`) cannot be opted out of.
   */
  disabled?: boolean;
  /**
   * Uncontrolled mode: the field never subscribes to its own value, so
   * typing re-renders nothing — the store still carries every write
   * (getValues/submit/validation read it), and errors/touched/disabled/
   * validating still re-render the field like react-hook-form's
   * `register`. The result's `value` is the mount-time snapshot (initial
   * value seed or baseline); it never refreshes, and bulk operations
   * (reset/setInitialValues) sync the DOM element directly through the
   * `focusRef`-held element instead of a render — the register-style
   * contract, RHF's reset clears the input the same way. Attach the
   * result with `<input defaultValue={field.value} ref={field.focusRef}>`
   * -style binding (no `value` prop), exactly like <Field uncontrolled />
   * does. The DOM sync writes the raw stored value (file inputs are
   * skipped); read live values with useValue/getValues.
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
  /**
   * Validate this field once on mount instead of waiting for the first
   * submit/change — errors show immediately for an untouched field.
   * Overrides the form-level `createForm({validateOnMount})` flag in
   * either direction (`false` opts a field out of a validating form).
   * While an async `initialValues` source is still pending the kick waits
   * for the resolved baseline; a field unmounted in between never kicks.
   */
  validateOnMount?: boolean;
  /**
   * DOM event → value extractor for the result's {@link
   * UseFieldResult.inputProps} binding. Defaults to the element's own
   * protocol (files → `target.files`, checkbox → `target.checked`,
   * `valueAsNumber`/`valueAsDate` under their flags, else
   * `target.value`); a non-DOM event passes through unchanged, so custom
   * controls can hand raw values. Only consumed by `inputProps` — the
   * headless `onChange` keeps taking raw values.
   */
  eventToValue?: (e: any) => any;
  /** `inputProps` stores `e.target.valueAsNumber` instead of the string
   * value (number inputs, RHF's `register({valueAsNumber})`). An
   * explicit `eventToValue` takes precedence. */
  valueAsNumber?: boolean;
  /** `inputProps` stores `e.target.valueAsDate` instead of the string
   * value (date/time inputs, RHF's `register({valueAsDate})`). An
   * explicit `eventToValue` takes precedence; combining with
   * `valueAsNumber` is a TypeError (`valueAsNumber` wins). */
  valueAsDate?: boolean;
  /**
   * Element type hint for {@link UseFieldResult.inputProps} only:
   * `'checkbox'` renders `checked` instead of `value`, `'file'` renders
   * neither (file inputs cannot be value-controlled). The extraction
   * itself already auto-detects both types from the event's target.
   */
  type?: string;
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
  /**
   * Whether the field is dirty: its live value exists and differs from
   * the field's effective baseline (the same per-field rule
   * `getFieldState(form, name).isDirty` applies — committed
   * `shouldDirty: false` baselines included). Live in controlled mode;
   * pinned at mount in uncontrolled mode (like `value`) so typing never
   * re-renders the field — {@link useIsFieldDirty} is the live scoped
   * channel for either mode.
   */
  isDirty: boolean;
  /**
   * Whether a validator round for this field is currently in flight —
   * a pending debounce window or an unresolved async validator (the
   * `getFieldState(form, name).isValidating` reading, made reactive).
   */
  validating: boolean;
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
  /**
   * DOM-ready props for an `<input>`: `<input {...field.inputProps} />`
   * binds the element to the field without hand-wiring value/onChange/
   * onBlur/ref/a11y. `onChange` takes the DOM event (extraction per
   * {@link UseFieldOptions}' `eventToValue`/`valueAsNumber`/`valueAsDate`
   * /`type`), `ref` is the focus channel, `aria-invalid`/`aria-describedby`
   * complete the {@link errorIdFromKey} chain — render the error element
   * with `fieldErrorId(name)` to finish it. The headless `value`/
   * `onChange`/`onBlur`/`focusRef` stay available for custom controls
   * that hand raw values (design systems) — `inputProps` is the DOM
   * boundary adapter, never a replacement.
   */
  inputProps: UseFieldInputProps;
};

/**
 * The spreadable DOM props {@link UseFieldResult.inputProps} carries:
 * `name`, `onChange` (event-based), `onBlur`, `ref`, `disabled`, the
 * error a11y wiring, and exactly one of `value` (controlled),
 * `defaultValue` (uncontrolled) or `checked` (`type: 'checkbox'`) —
 * `type: 'file'` carries none. Always spread `inputProps` FIRST, so the
 * caller's own props (placeholder, className, an explicit `ref` they
 * merge themselves) win.
 */
export type UseFieldInputProps = {
  name: string;
  value?: any;
  defaultValue?: any;
  checked?: boolean;
  onChange: (e: any) => void;
  onBlur: () => void;
  ref: (el: any) => void;
  disabled: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

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
 *
 * The subscription rides {@link useWatchCore} (useSyncExternalStore), so
 * it is live before sibling passive effects kick mount validation and
 * re-renders synchronously on every error event — the same contract the
 * previous dedicated error watch held. The pending window is the only
 * mutable piece and lives in refs: the subscribe callback flips it and
 * the window's timer invalidates the snapshot at the deadline. No state
 * writes at all — the shown list is derived from the store plus the
 * window flag, so nothing runs in an effect body or during render. With
 * `delay === undefined` the subscription still drives re-renders but the
 * store's list passes through untouched: no timers, no window state —
 * fields that do not opt in pay nothing beyond the hook call itself.
 */

/** Shared empty list returned while {@link useDelayedErrors} holds an
 * appearing error back — a stable reference so consumers can memo on it,
 * mirroring the core's shared NO_ERRORS constant. */
const NO_DELAYED_ERRORS: FieldError[] = [];

function useDelayedErrors(
  form: Form<any>,
  path: Path,
  delay: number | undefined
): FieldError[] {
  // The window flag and the last event's shape live in refs: the
  // subscribe callback reads them across events, and the snapshot reads
  // the flag at render. Single-threaded, so flag-then-invalidate is
  // always observed as one consistent state.
  const pendingRef = useRef(false);
  const prevRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subscribeFactory = useCallback(
    (invalidate: () => void) => {
      // Rebuild the Path from its key so the callback never captures the
      // render-scope `path` object — the subscription pins on the key.
      const spath = createPath(JSON.parse(path.key) as PathSegments);
      const clearTimer = () => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };
      // A re-subscription (delay change, StrictMode remount) drops any
      // stale window: the new subscription re-derives from the store.
      pendingRef.current = false;
      prevRef.current = false;
      clearTimer();
      const startWindow = () => {
        clearTimer();
        pendingRef.current = true;
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          pendingRef.current = false;
          // Deadline reached with the errors stable through the window:
          // re-render so the snapshot reveals them.
          invalidate();
        }, delay);
      };
      const off = onKeyEvent(form.emitter, 'errors', spath.key, () => {
        const has = getFieldErrorsByPath(form, spath).length > 0;
        const was = prevRef.current;
        prevRef.current = has;
        if (delay !== undefined) {
          if (!has) {
            // Clearing is always immediate: an error cleared inside the
            // window is cancelled before ever showing, a shown one hides
            // at once.
            if (pendingRef.current) {
              clearTimer();
              pendingRef.current = false;
            }
          } else if (!was || pendingRef.current) {
            // Appearing from none — or changing inside the window, which
            // restarts it: wait out `delay` before showing. Already
            // showing: swaps and list changes apply at once (nothing to
            // do beyond the invalidate below).
            startWindow();
          }
        }
        invalidate();
      });
      return () => {
        off();
        clearTimer();
      };
    },
    [form, path.key, delay]
  );

  return useWatchCore(subscribeFactory, () =>
    delay === undefined || !pendingRef.current
      ? getFieldErrorsByPath(form, path)
      : NO_DELAYED_ERRORS
  );
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
    validateOnMount,
    delayError,
    disabled,
    uncontrolled,
    asyncAlways,
    mode: modeOption,
    eventToValue,
    valueAsNumber,
    valueAsDate,
    type
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
  // A Standard Schema passed straight to `validate` becomes a validator
  // before composing with the rules (combineRulesAndValidate calls the
  // validator as a function, which a schema object is not).
  const validateOption = validate;
  const validateWrapped: Validator | undefined =
    validateOption && hasStandardProps(validateOption)
      ? schemaToFieldValidator(validateOption as StandardSchemaV1<any, any>)
      : (validateOption as Validator | undefined);
  useValidate(combineRulesAndValidate(restRules, validateWrapped), path, form, {
    debounce: validateDebounce,
    validateOnMount,
    asyncAlways: asyncAlways ?? form.asyncAlways,
    sync:
      rules && rules.required !== undefined
        ? rulesToValidator({required: rules.required})
        : undefined
  });

  // All errors of the field through one subscription owned by
  // useDelayedErrors; the array reference is stable (stored array or
  // shared empty constants), so consumers can memo on it. delayError
  // gates only this render-layer view of the list; the stored list keeps
  // driving the reValidateMode kicks inside the core's user-change gate.
  const errors = useDelayedErrors(form, path, delayError);
  const errorObject = errors[0];
  const error = errorObject?.message;
  const value = useFieldValue(form, path, !!uncontrolled);
  // isDirty is a value-derived flag: like the value itself, it stays live
  // only in controlled mode. Uncontrolled fields pin it at mount — a live
  // subscription here would re-render the field on every keystroke and
  // break the register-parity contract (typing re-renders nothing). The
  // live scoped channel for either mode is useIsFieldDirty. `validating`
  // is a non-value flag: it stays subscribed in both modes (like errors/
  // touched/disabled), matching its exact key with payload-less
  // broadcasts still syncing everything.
  const isDirty = useWatchCore(
    useCallback(
      (invalidate: () => void) =>
        uncontrolled
          ? () => {}
          : onPathEvent(
              form.emitter,
              'change',
              createPath(JSON.parse(path.key) as PathSegments),
              'leaf',
              invalidate
            ),
      [form.emitter, path.key, uncontrolled]
    ),
    () => isFieldDirtyByPath(form, path)
  );
  const validating = useWatchCore(
    useCallback(
      (invalidate: () => void) =>
        onKeyEvent(form.emitter, 'validating', path.key, invalidate),
      [form.emitter, path.key]
    ),
    () => form.validating.has(path.key)
  );

  // The disabled merge — computed INSIDE the watch snapshot, because
  // useSyncExternalStore bails out of re-rendering when the snapshot is
  // Object.is-equal: splitting the merge out of the getter would keep the
  // form-flag snapshot unchanged while an ancestor's option flips, and
  // the re-render (and with it the fresh registry read) would never run.
  // Subscribed with branch scope on the 'disabled' event: setDisabled's
  // payload-less emit wakes every field, while a path-payload emit (this
  // field's own or an ancestor's `disabled` option registering/flipping)
  // wakes exactly the affected subtree. The merge rule: the form-level
  // flag (no opt-out) OR this field's own `true`, OR — while this field
  // did not opt out with `false` — an ancestor declared disabled
  // (react-hook-form subtree semantics).
  const mergedDisabled = useWatchCore(
    useCallback(
      (invalidate: () => void) =>
        onPathEvent(
          form.emitter,
          'disabled',
          createPath(JSON.parse(path.key) as PathSegments),
          'branch',
          invalidate
        ),
      [form.emitter, path.key]
    ),
    () =>
      form.disabled ||
      disabled === true ||
      (disabled !== false && hasDisabledAncestor(form, path))
  );

  // Publish this field's own `disabled` option into the subtree registry
  // so descendants merge it in — and re-render when it flips (the
  // registration emits the path-payload 'disabled' event). A field that
  // never declares the option registers nothing.
  const disabledTokenRef = useRef<object | null>(null);
  useEffect(() => {
    const spath = createPath(JSON.parse(path.key) as PathSegments);
    const registration = registerFieldDisabled(form, spath, disabled);
    if (registration) disabledTokenRef.current = registration.token;
    return () => {
      if (disabledTokenRef.current !== null) {
        unregisterFieldDisabled(form, spath, disabledTokenRef.current);
        disabledTokenRef.current = null;
      }
    };
  }, [form, path.key, disabled]);

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
    const spath = createPath(JSON.parse(path.key) as PathSegments);
    const {token, displaced} = registerFieldMode(form, spath, modeOption);
    if (__DEV__ && displaced) {
      // eslint-disable-next-line no-console -- the whole point of this branch
      console.warn(
        `react-f0rm: two fields are mounted at the same path ${path.key}. ` +
          `The latest mount's mode registration owns the slot, so changeValue ` +
          `writes gate on it and the earlier field's validation mode no ` +
          `longer applies. Use distinct names if both must stay mounted.`
      );
    }
    return () => unregisterFieldMode(form, spath, token);
  }, [form, path.key, modeOption]);

  // Publish this field's validateDeps declaration so the dep fields'
  // change pipelines can find it (revalidateDependentsOnChange). Keyed on
  // the serialized dep list, so a re-render passing an equal inline array
  // does not churn the registry; a genuinely changed list re-registers.
  const depsKey = validateDeps?.length ? validateDeps.join('\n') : undefined;
  // Stage the dep list: the effect keys on `depsKey` (the serialized
  // list), and reads the live array through the ref so an equal inline
  // array per render never re-registers while a changed one always does.
  const validateDepsRef = useStage<string[] | undefined>(validateDeps);
  useEffect(() => {
    if (!depsKey) return;
    const depKeys = validateDepsRef.current!.map(dep => createPath(dep).key);
    registerFieldValidateDeps(form, path.key, depKeys);
    return () => unregisterFieldValidateDeps(form, path.key, depKeys);
  }, [form, path.key, depsKey, validateDepsRef]);

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

  // Uncontrolled DOM sync: a payload-less 'change' means a bulk operation
  // (reset, setInitialValues) rewrote values without a React render, and
  // an uncontrolled field deliberately never subscribes to its own value
  // — so its DOM element would keep stale text. Write the store's value
  // straight into the element held by the focus channel (register-style:
  // no re-render — exactly how RHF's reset clears uncontrolled inputs).
  //
  // One listener per form, not per field: a per-field subscription would
  // add O(mounted fields) handler calls to every keystroke — breaking the
  // O(affected-fields) change contract the uncontrolled parity bench
  // measures. The shared listener returns on the first check for
  // payload-carrying emits (typing, setValue), so bulk operations pay one
  // iteration over the registered cells and keystrokes pay one branch.
  useEffect(() => {
    const spath = createPath(JSON.parse(path.key) as PathSegments);
    let entry = uncontrolledSyncRegistry.get(form);
    if (!entry) {
      const cells = new Map<string, () => {el: any; path: Path}>();
      const off = on(form.emitter, 'change', (changed?: Path) => {
        if (changed) return;
        for (const read of cells.values()) {
          const {el, path} = read();
          // File inputs cannot be assigned a value at all.
          if (!el || el.type === 'file') continue;
          const next = getValueByPath(form, path);
          const asString = next == null ? '' : String(next);
          if (el.value !== asString) el.value = asString;
        }
      });
      entry = {cells, off};
      uncontrolledSyncRegistry.set(form, entry);
    }
    entry.cells.set(path.key, () => ({el: elementRef.current, path: spath}));
    return () => {
      entry!.cells.delete(path.key);
      if (entry!.cells.size === 0) {
        entry!.off();
        uncontrolledSyncRegistry.delete(form);
      }
    };
  }, [form, path.key, uncontrolled]);

  // Effective unmount behavior: the field's own option, falling back
  // to the form-level default, then to this library's historical
  // default (tombstone). The removal snapshots first and a setup that
  // immediately follows the cleanup (StrictMode's dev
  // setup→cleanup→setup cycle) restores it — see useUnmountRestore.
  const removalSnapshotRef = useRef<RemovedFieldSnapshot | null>(null);
  const teardownOnUnmount = useStageFn(() => {
    if ((shouldUnregister ?? form.shouldUnregister) === false) return;
    removalSnapshotRef.current = removeFieldForUnmount(form, path);
  });
  const restoreAfterStrictMode = useStageFn(() => {
    const snapshot = removalSnapshotRef.current;
    removalSnapshotRef.current = null;
    if (snapshot) restoreRemovedField(form, path, snapshot);
  });
  useUnmountRestore(teardownOnUnmount, restoreAfterStrictMode);

  // inputProps: the DOM-boundary adapter over the same headless handlers.
  // Its onChange takes the DOM event — extraction per the options above or
  // the element's own protocol — so `<input {...field.inputProps} />`
  // behaves exactly like <Field>'s default binding.
  if (__DEV__ && valueAsNumber && valueAsDate) {
    // eslint-disable-next-line no-console -- dev-only diagnostics
    console.warn(
      'react-f0rm: valueAsNumber and valueAsDate are mutually exclusive — ' +
        'valueAsNumber wins. Use eventToValue for anything else.'
    );
  }
  const extract =
    eventToValue ??
    ((e: any) => extractEventValue(e, {valueAsNumber, valueAsDate}));
  const inputProps: UseFieldInputProps = {
    name: path.key,
    ref: focusRef,
    onChange: (e: any) => onChange(extract(e)),
    onBlur,
    disabled: mergedDisabled,
    ...(type === 'checkbox'
      ? {checked: !!value}
      : type === 'file'
        ? {}
        : uncontrolled
          ? {defaultValue: value}
          : {value: value ?? ''}),
    ...(error
      ? {'aria-invalid': true, 'aria-describedby': errorIdFromKey(path.key)}
      : {})
  };

  return {
    form,
    value,
    error,
    errorObject,
    errors,
    isDirty,
    validating,
    onChange,
    onBlur,
    name: path.key,
    disabled: mergedDisabled,
    focusRef,
    inputProps
  };
}

export default function useField<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments
>(options: UseFieldOptions<TValues, TPath>): UseFieldResult<TValues, TPath> {
  return useFieldCore(options, FormContext);
}
