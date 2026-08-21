import {create as createEmitter, emit as _emit} from '@for-fun/event-emitter';
import type {EventEmitter} from '@for-fun/event-emitter';
import createPath from './path';
import type {Name, Path, PathSegments} from './path';
import type {FieldPath, PathValueOf} from './types';
import {get, normalizePath, setOwned, unset, waitUntil} from './util';

export type {Name};
export type {FieldPath, PathValue} from './types';

const emit = _emit as (
  emitter: EventEmitter,
  event: string,
  ...args: any[]
) => void;

/** A field error: `type` identifies the error kind ('custom' for plain
 * string errors), `message` is the display text. */
export interface FieldError {
  type: string;
  message: string;
}

/** A flattened entry from {@link getErrors}. */
export type FieldErrorEntry = {path: string; type: string; message: string};

/** When a field is validated:
 * - `'onSubmit'` (default): only on submit
 * - `'onBlur'`: when the field loses focus
 * - `'onChange'`: on every change
 * - `'onTouched'`: on first blur, then on every change
 * - `'all'`: on both change and blur
 */
export type ValidationMode =
  | 'onSubmit'
  | 'onBlur'
  | 'onChange'
  | 'onTouched'
  | 'all';

/** When a field is re-validated after it already has an error:
 * - `'onChange'` (default): on every change
 * - `'onBlur'`: when the field loses focus
 * - `'onSubmit'`: only on submit (no live re-validation)
 */
export type ReValidateMode = 'onChange' | 'onBlur' | 'onSubmit';

export interface Form<T extends Record<string, any> = any> {
  emitter: EventEmitter;
  mode: ValidationMode;
  reValidateMode: ReValidateMode;
  initialValues: T;
  values: Map<string, any>;
  /** Tombstones of unregistered field paths (JSON path keys): reading or
   * merging values must not fall back to initialValues for these paths. */
  deleted: Set<string>;
  errors: Map<string, FieldError>;
  touched: Set<string>;
  validators: Map<string, () => void>;
  validating: Set<string>;
  validate?: (values: T) => Record<string, any> | Promise<Record<string, any>>;
  isSubmitting: boolean;
  submitCount: number;
  isSubmitSuccessful: boolean | undefined;
}

export type Options<T extends Record<string, any> = any> = {
  initialValues?: T;
  /** When fields are validated. Defaults to `'onSubmit'`. See
   * {@link ValidationMode}. */
  mode?: ValidationMode;
  /** When a field is re-validated after it already has an error — it only
   * takes effect once the field has an error. Defaults to `'onChange'`. See
   * {@link ReValidateMode}. */
  reValidateMode?: ReValidateMode;
  /**
   * Form-level validator. Returns a record of errors keyed by field path;
   * nested objects are flattened ('a.b' style) and array values contribute
   * their first non-empty string (zod `flatten()` formErrors style).
   */
  validate?: (values: T) => Record<string, any> | Promise<Record<string, any>>;
};

/**
 * Create form instance
 * @param options
 * @return form instance
 */
export default function create<T extends Record<string, any> = any>(
  options?: Options<T>
): Form<T> {
  const emitter = createEmitter();
  return {
    emitter,
    ...options,
    mode: options?.mode ?? 'onSubmit',
    reValidateMode: options?.reValidateMode ?? 'onChange',
    initialValues: (options?.initialValues ?? {}) as T,
    values: new Map(),
    deleted: new Set(),
    errors: new Map(),
    touched: new Set(),
    validators: new Map(),
    validating: new Set(),
    isSubmitting: false,
    submitCount: 0,
    isSubmitSuccessful: undefined
  };
}

/**
 * Get form values: the values Map layered over initialValues.
 *
 * Merged with copy-on-write ownership tracking ({@link setOwned}): every
 * distinct container on a written path is allocated once and shared by all
 * paths through it, instead of re-copying the whole branch for every key.
 * The result is still a freshly merged tree per call, with untouched
 * branches sharing references with initialValues exactly like chained
 * `set` did -- callers may treat it as their own copy.
 *
 * @param form
 */
export function getValues(form: Form): any {
  const {initialValues, values, deleted} = form;
  const owned = new Set<object>();
  let merged = initialValues;
  for (const [key, value] of values) {
    merged = setOwned(merged, JSON.parse(key), value, owned);
  }
  // Unregistered fields leave a tombstone in `deleted`; remove those paths
  // from the merged result so they don't fall back to initialValues. unset
  // is immutable (set() shares untouched branches with initialValues, so a
  // mutating delete would corrupt them) and deletes the key outright rather
  // than writing undefined, which would leave `a: undefined` entries behind
  // in anything that spreads getValues().
  for (const key of deleted) {
    merged = unset(merged, JSON.parse(key));
  }
  return merged;
}

/**
 * Get field value
 * @param form
 * @param name
 */
export function getValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | Name = Name
>(form: Form<T>, name: P): PathValueOf<T, P> {
  return getValueByPath(form, createPath(name));
}

/**
 * Get field value by path
 * @param form
 * @param path
 */
export function getValueByPath(
  {initialValues, values, deleted}: Form,
  path: Path
): any {
  if (values.has(path.key)) return values.get(path.key);
  // Unregistered path: the tombstone blocks the initialValues fallback.
  if (deleted.has(path.key)) return undefined;
  return get(initialValues, path.value);
}

/** Options accepted by {@link setValue} / {@link setValueByPath}. Every flag
 * defaults to `false`; omitting the options object entirely keeps the plain
 * set-value behavior (no validation, no touched marking). */
export interface SetFieldOptions {
  /** Run the field's registered validator (if any) after the value lands,
   * same as triggering that single field. Defaults to `false`. */
  shouldValidate?: boolean;
  /** Mark the field as touched. Defaults to `false`. */
  shouldTouch?: boolean;
  /** Reserved for a future manual dirty marker. Dirty state is currently
   * derived from comparing values against initialValues, so this flag is
   * accepted but does nothing. Defaults to `false`. */
  shouldDirty?: boolean;
}

/**
 * Set field value
 * @param form
 * @param name
 * @param value
 * @param options
 */
export function setValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | Name = Name
>(
  form: Form<T>,
  name: P,
  value: PathValueOf<T, P>,
  options?: SetFieldOptions
): void {
  setValueByPath(form, createPath(name), value, options);
}

/**
 * Set field value
 * @param form
 * @param path
 * @param value
 * @param options
 */
export function setValueByPath(
  form: Form,
  path: Path,
  value: any,
  options?: SetFieldOptions
): void {
  const {emitter, values, deleted} = form;
  values.set(path.key, value);
  reviveBranch(deleted, path);
  bumpDirtyVersion(form);
  if (options?.shouldTouch) setTouchedByPath(form, path);
  if (options?.shouldValidate) form.validators.get(path.key)?.();
  emit(emitter, 'change', path);
}

/**
 * Get field error
 * @param form
 * @param name
 * @return FieldError object or undefined
 */
export function getError<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | Name = Name
>(form: Form<T>, name: P): FieldError | undefined {
  return getErrorByPath(form, createPath(name));
}

/**
 * Get field error by path
 * @param form
 * @param path
 * @return FieldError object or undefined
 */
export function getErrorByPath(
  {errors}: Form,
  path: Path
): FieldError | undefined {
  return errors.get(path.key);
}

/**
 * Get all errors
 * @param form
 * @return array of {path, type, message} entries, in insertion order; path
 *         is the user-facing dotted field path ('a.b', 'list.0')
 */
export function getErrors({errors}: Form): FieldErrorEntry[] {
  return Array.from(errors, ([key, error]) => ({
    path: (JSON.parse(key) as PathSegments).join('.'),
    type: error.type,
    message: error.message
  }));
}

/**
 * Get first error message
 * @param form
 * @return first error's message string, or undefined when there are no errors
 */
export function getFirstError({errors}: Form): string | undefined {
  return errors.values().next().value?.message;
}

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
 * Set field error
 * @param form
 * @param name
 * @param error string is normalized to {type: 'custom', message};
 *        a FieldError object is stored as-is; undefined clears the error
 */
export function setError<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | Name = Name
>(form: Form<T>, name: P, error: string | FieldError | undefined): void {
  setErrorByPath(form, createPath(name), error);
}

/**
 * Set field error
 * @param form
 * @param path
 * @param error string is normalized to {type: 'custom', message};
 *        a FieldError object is stored as-is; undefined clears the error
 */
export function setErrorByPath(
  {emitter, errors}: Form,
  path: Path,
  error: string | FieldError | undefined
): void {
  if (error) {
    errors.set(
      path.key,
      typeof error === 'string' ? {type: 'custom', message: error} : error
    );
  } else {
    errors.delete(path.key);
  }
  // Path payload lets key-scoped subscribers (onKeyEvent) skip unrelated
  // fields; payload-less listeners ignore it.
  emit(emitter, 'errors', path);
}

/**
 * Clear errors
 * @param form
 */
export function clearErrors({emitter, errors}: Form): void {
  errors.clear();
  emit(emitter, 'errors');
}

/**
 * Set field touched state
 * @param form
 * @param name
 */
export function setTouched(form: Form, name: Name): void {
  setTouchedByPath(form, createPath(name));
}

/**
 * Set field touched state
 * @param form
 * @param path
 */
export function setTouchedByPath({emitter, touched}: Form, path: Path): void {
  if (touched.has(path.key)) return;
  touched.add(path.key);
  // Path payload lets key-scoped subscribers (onKeyEvent) skip unrelated
  // fields; payload-less listeners ignore it.
  emit(emitter, 'touched', path);
}

/**
 * Check if field has been touched
 * @param form
 * @param name
 */
export function hasTouched<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | Name = Name
>(form: Form<T>, name: P): boolean {
  return hasTouchedByPath(form, createPath(name));
}

/**
 * Check if field has been touched
 * @param form
 * @param path
 */
export function hasTouchedByPath({touched}: Form, path: Path): boolean {
  return touched.has(path.key);
}

/**
 * Is dirty -- any value differs from initialValues
 * @param form
 */
export function isDirty(form: Form): boolean {
  let dirty = false;
  forEachDirtyField(form, () => {
    dirty = true;
  });
  return dirty;
}

function forEachDirtyField(
  {initialValues, values}: Form,
  fn: (dottedKey: string) => void
): void {
  for (const [key, value] of values) {
    const path = JSON.parse(key) as PathSegments;
    if (get(initialValues, path) !== value) fn(path.join('.'));
  }
}

/** Per-form memoization of {@link getDirtyFields}. `version` counts value
 * mutations since the cached `result` was computed: bump points increment
 * it, reads reset it, so a non-zero version means the cache is stale. */
interface DirtyFieldsCache {
  version: number;
  result: Record<string, boolean>;
}

const dirtyFieldsCaches = new WeakMap<Form, DirtyFieldsCache>();

/**
 * Invalidate `form`'s cached {@link getDirtyFields} result. Called at every
 * point that can change values or initialValues (setValueByPath,
 * removeFieldByPath, setInitialValues, reset) so repeated reads hand out a
 * stable reference and useWatch's Object.is snapshot check can skip
 * re-renders.
 */
function bumpDirtyVersion(form: Form): void {
  const cache = dirtyFieldsCaches.get(form);
  if (cache) cache.version++;
}

function computeDirtyFields(form: Form): Record<string, boolean> {
  const dirtyFields: Record<string, boolean> = {};
  forEachDirtyField(form, key => {
    dirtyFields[key] = true;
  });
  return dirtyFields;
}

/** Dirty entries only ever map to `true`, so equal key sets mean shallow
 * equal results. */
function sameDirtyKeys(
  a: Record<string, boolean>,
  b: Record<string, boolean>
): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(key => b[key] === true);
}

/**
 * Get dirty fields -- fields whose current value differs from initialValues.
 * Keys are user-facing dotted paths ('a.b', 'a.0.c'), unlike the JSON array
 * keys stored in the values Map.
 * @param form
 * @return object mapping each dirty field's dotted path to true; the same
 * reference is returned until the dirty set actually changes
 */
export function getDirtyFields(form: Form): Record<string, boolean> {
  let cache = dirtyFieldsCaches.get(form);
  if (!cache) {
    cache = {version: 0, result: computeDirtyFields(form)};
    dirtyFieldsCaches.set(form, cache);
  } else if (cache.version > 0) {
    const result = computeDirtyFields(form);
    // Keep the old reference when the dirty set is unchanged (values always
    // map to true) so subscribers see identity-stable snapshots.
    if (!sameDirtyKeys(cache.result, result)) cache.result = result;
    cache.version = 0;
  }
  return cache.result;
}

/**
 * Get touched fields as user-facing dotted paths ('a.b', 'a.0.c'), unlike
 * the JSON array keys stored in the touched Set.
 * @param form
 * @return array of touched fields' dotted paths
 */
export function getTouchedFields({touched}: Form): string[] {
  return Array.from(touched, key =>
    (JSON.parse(key) as PathSegments).join('.')
  );
}

/**
 * Is touched -- any field has been touched
 * @param form
 */
export function isTouched({touched}: Form): boolean {
  return touched.size > 0;
}

/**
 * Remove field
 * @param form
 * @param name
 */
export function removeField(form: Form, name: Name): void {
  removeFieldByPath(form, createPath(name));
}

/**
 * Remove field
 * @param form
 * @param path
 */
export function removeFieldByPath(
  form: Form,
  {key, value: segments}: Path
): void {
  const {emitter, values, touched, errors, validating, deleted} = form;
  values.delete(key);
  touched.delete(key);
  errors.delete(key);
  validating.delete(key);
  // Tombstone the unregistered path so later reads do not fall back to
  // initialValues and "revive" the field's old initial value. A tombstone
  // never shadows live values: skip it when the branch is already covered
  // by a live ancestor key (e.g. a FieldArray rewrite stored the whole
  // array at the parent path) or a still-mounted descendant key.
  if (!hasLiveBranch(values, segments)) deleted.add(key);
  bumpDirtyVersion(form);
  emit(emitter, 'change');
  emit(emitter, 'touched');
  emit(emitter, 'errors');
  emit(emitter, 'validating');
}

/**
 * Does a live value cover the branch at `segments` -- either at an ancestor
 * key or below it at a descendant key?
 */
function hasLiveBranch(
  values: Map<string, any>,
  segments: PathSegments
): boolean {
  for (let i = 1; i < segments.length; i++) {
    if (values.has(JSON.stringify(segments.slice(0, i)))) return true;
  }
  const stem = `${JSON.stringify(segments).slice(0, -1)},`;
  for (const key of values.keys()) {
    if (key.startsWith(stem)) return true;
  }
  return false;
}

/**
 * Writing a value revives its whole branch: drop any removal tombstone for
 * the path itself, its ancestors, or its descendants (a remounted field
 * overwrites its own tombstone; rewriting a parent array supersedes the
 * tombstones of shifted child paths).
 */
function reviveBranch(deleted: Set<string>, {key}: Path): void {
  if (!deleted.size) return;
  for (const tombstone of deleted) {
    if (
      tombstone === key ||
      tombstone.startsWith(`${key.slice(0, -1)},`) ||
      key.startsWith(`${tombstone.slice(0, -1)},`)
    ) {
      deleted.delete(tombstone);
    }
  }
}

/**
 * Set form initialValues
 * @param form
 * @param initialValues
 */
export function setInitialValues(form: Form, initialValues: any): void {
  if (form.initialValues === initialValues) return;
  form.initialValues = initialValues;
  form.values.clear();
  form.deleted.clear();
  bumpDirtyVersion(form);
  emit(form.emitter, 'change');
}

/**
 * Reset form
 * @param form
 * @param initialValues
 */
export function reset(form: Form, initialValues?: any): void {
  form.initialValues = initialValues;
  clearErrors(form);
  const {emitter, touched, values, deleted, validating} = form;
  values.clear();
  deleted.clear();
  touched.clear();
  validating.clear();
  form.isSubmitting = false;
  form.submitCount = 0;
  form.isSubmitSuccessful = undefined;
  bumpDirtyVersion(form);
  emit(emitter, 'change');
  emit(emitter, 'touched');
  emit(emitter, 'validating');
  emit(emitter, 'submitting');
  emit(emitter, 'submitCount');
  emit(emitter, 'submitSuccessful');
  emit(emitter, 'reset');
}

/**
 * @param form
 */
export function hasErrors({errors}: Form): boolean {
  return errors.size > 0;
}

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
 * Field validators may be asynchronous: their errors land asynchronously
 * once the validator settles. Trigger only kicks validators off — it
 * returns void and never awaits them.
 *
 * @param form
 * @param name field name(s) to trigger, or all fields when omitted
 */
export function trigger(form: Form, name?: Name | Name[]): void {
  if (name === undefined) {
    form.validators.forEach(validator => validator());
    return;
  }
  if (typeof name === 'string' || isSegmentsPath(name)) {
    form.validators.get(createPath(name).key)?.();
    return;
  }
  name.forEach(one => form.validators.get(createPath(one).key)?.());
}

/** Numbers only occur inside a segments path (`['a', 0]`), never as
 * standalone names, so a top-level number marks `name` as one single path
 * rather than a list of names. */
function isSegmentsPath(name: PathSegments | Name[]): name is PathSegments {
  return (name as (number | unknown)[]).some(part => typeof part === 'number');
}

function isFieldError(value: any): value is FieldError {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.type === 'string' &&
    typeof value.message === 'string'
  );
}

/**
 * Flatten a form-level validate result and write each leaf error through
 * setError. Nested objects descend into deeper paths ({a: {b: 'msg'}} sets
 * the 'a.b' error), array values contribute their first non-empty string
 * (zod flatten() formErrors style), and FieldError-shaped objects are
 * stored as-is. Falsy values are skipped.
 */
function setFormErrors(
  form: Form,
  result: Record<string, any>,
  segments: PathSegments = []
): void {
  Object.entries(result).forEach(([key, value]) => {
    const path: PathSegments = [...segments, ...normalizePath(key)];
    if (typeof value === 'string') {
      if (value) setError(form, path, value);
    } else if (Array.isArray(value)) {
      const message = value.find(item => typeof item === 'string' && item);
      if (message) setError(form, path, message);
    } else if (isFieldError(value)) {
      setError(form, path, value);
    } else if (value && typeof value === 'object') {
      setFormErrors(form, value, path);
    }
  });
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
    () => !form.validating.size,
    () => hasErrors(form)
  ).catch(() => {
    throw new Error(getFirstError(form));
  });

  if (form.validate) {
    const result = await form.validate(getValues(form));
    if (result) setFormErrors(form, result);
    if (hasErrors(form)) throw new Error(getFirstError(form));
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

export function setIsSubmitting(form: Form, value: boolean): void {
  form.isSubmitting = value;
  emit(form.emitter, 'submitting');
}

export function incrementSubmitCount(form: Form): void {
  form.submitCount++;
  emit(form.emitter, 'submitCount');
}

export function setSubmitSuccessful(form: Form, value: boolean): void {
  form.isSubmitSuccessful = value;
  emit(form.emitter, 'submitSuccessful');
}

/** Structural slice of a <form>-like element: an elements collection whose
 * controls expose the constraint-validation members we read. Matches the
 * DOM HTMLFormElement shape without coupling the core to DOM types. */
interface NativeFormElement {
  elements: ArrayLike<{
    name: string;
    checkValidity: () => boolean;
    validationMessage: string;
  }>;
}

/**
 * Converts a control's DOM name to the user-visible dotted path. Field
 * components render the path key (JSON.stringify'd segments, '["a","0"]')
 * as the name attribute, so JSON keys are parsed back and joined with
 * dots; any other name value is returned as-is.
 */
function nameToPath(name: string): string {
  if (name.startsWith('[')) {
    try {
      const segments = JSON.parse(name);
      if (Array.isArray(segments)) return segments.join('.');
    } catch {
      // Not a JSON path key — fall through and use the raw name.
    }
  }
  return name;
}

/**
 * Collects the constraints failing native validation on a <form> as
 * {@link FieldErrorEntry} entries, in DOM order.
 *
 * Design note: native errors are deliberately NOT written into the form's
 * errors Map. That Map tracks custom validator state, while native
 * validity is transient DOM state owned by the browser (surfaced through
 * reportValidity); onInvalidSubmit receives this snapshot directly.
 */
function getNativeErrors(formEl: NativeFormElement): FieldErrorEntry[] {
  const errors: FieldErrorEntry[] = [];
  const {elements} = formEl;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (
      el.name &&
      typeof el.checkValidity === 'function' &&
      !el.checkValidity()
    ) {
      errors.push({
        path: nameToPath(el.name),
        type: 'native',
        message: el.validationMessage
      });
    }
  }
  return errors;
}

/** Submit callbacks for {@link handleSubmit}. All optional — a missing
 * callback is simply skipped, matching the <Form> component semantics. */
export interface HandleSubmitOptions<T extends Record<string, any> = any> {
  /** Called after validation passes, before onValidSubmit. */
  onSubmit?: (values: T, e?: any) => void | Promise<void>;
  /** Called after validation passes, following a successful onSubmit. */
  onValidSubmit?: (values: T, e?: any) => void | Promise<void>;
  /**
   * Called when validation fails.
   * @param errors array of {path, type, message} entries in insertion
   *        order; path is the dotted field path ('a.b', 'list.0'), type is
   *        the error kind ('custom' for plain string errors, 'native' for
   *        failed DOM constraint validation), message is the display text
   * @param values current form values
   */
  onInvalidSubmit?: (errors: FieldErrorEntry[], values: T) => void;
  /**
   * Focus the first error field after a failed submit. Defaults to true —
   * only an explicit `false` disables it. When custom validation fails,
   * a 'focusError' event carrying the first error's path key is emitted
   * on the form (bound fields such as <Field> subscribe and focus their
   * input); when native constraint validation fails, the submitted
   * form's first ':invalid' control is focused directly.
   */
  shouldFocusError?: boolean;
}

/**
 * Create an async submit handler for `form` — the headless counterpart of
 * the <Form> component's onSubmit wiring.
 *
 * Behavior mirrors <Form> exactly: preventDefault when present, then the
 * submit state machine (isSubmitting/submitCount/isSubmitSuccessful) runs
 * around native constraint validation (via `e.currentTarget.checkValidity`,
 * skipped when the target has no checkValidity — e.g. React Native or
 * toolbar-button submits) and custom validators. Failed validation fires
 * onInvalidSubmit with the flattened error entries; a passing submit runs
 * onSubmit then onValidSubmit. Errors thrown by either are swallowed into
 * isSubmitSuccessful=false rather than rejecting the returned promise.
 * Failed validation also focuses the offending field (see
 * {@link HandleSubmitOptions.shouldFocusError}).
 *
 * @param form form instance
 * @param options submit callbacks
 * @return async event handler, callable without an event object
 */
export function handleSubmit<T extends Record<string, any> = any>(
  form: Form<T>,
  options?: HandleSubmitOptions<T>
): (e?: {preventDefault?: () => void; currentTarget?: any}) => Promise<void> {
  const {
    onSubmit,
    onValidSubmit,
    onInvalidSubmit,
    shouldFocusError = true
  } = options ?? {};
  return async e => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const formEl = e?.currentTarget;
    setIsSubmitting(form, true);
    incrementSubmitCount(form);
    const values = getValues(form) as T;

    if (
      formEl &&
      typeof formEl.checkValidity === 'function' &&
      formEl.checkValidity() === false
    ) {
      formEl.reportValidity();
      // Focus the first natively-invalid control directly off the DOM;
      // native failures never enter the errors Map (see below).
      if (shouldFocusError && typeof formEl.querySelector === 'function') {
        const invalid = formEl.querySelector(':invalid') as HTMLElement | null;
        if (invalid && typeof invalid.focus === 'function') invalid.focus();
      }
      setIsSubmitting(form, false);
      setSubmitSuccessful(form, false);
      // Native constraint failures are read from the DOM (not the errors
      // Map, which only holds custom validation state — see getNativeErrors).
      if (onInvalidSubmit) onInvalidSubmit(getNativeErrors(formEl), values);
      return;
    }

    const error = await validate(form);

    if (error) {
      setIsSubmitting(form, false);
      setSubmitSuccessful(form, false);
      // Notify bound fields (e.g. <Field>) so the first errored one can
      // focus its input; the payload is the errors Map's first key.
      if (shouldFocusError) {
        const firstKey = form.errors.keys().next().value;
        if (firstKey !== undefined) emit(form.emitter, 'focusError', firstKey);
      }
      if (onInvalidSubmit) onInvalidSubmit(getErrors(form), values);
      return;
    }

    try {
      if (onSubmit) await onSubmit(values, e);
      if (onValidSubmit) await onValidSubmit(values, e);
      setSubmitSuccessful(form, true);
    } catch {
      setSubmitSuccessful(form, false);
    } finally {
      setIsSubmitting(form, false);
    }
  };
}
