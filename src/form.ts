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

export interface Form<T extends Record<string, any> = any> {
  emitter: EventEmitter;
  revalidateOnChange: boolean;
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
  validateOnSubmit?: boolean;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  revalidateOnChange?: boolean;
  revalidateOnBlur?: boolean;
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
    revalidateOnChange: true,
    ...options,
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

/**
 * Set field value
 * @param form
 * @param name
 * @param value
 */
export function setValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | Name = Name
>(form: Form<T>, name: P, value: PathValueOf<T, P>): void {
  setValueByPath(form, createPath(name), value);
}

/**
 * Set field value
 * @param form
 * @param path
 * @param value
 */
export function setValueByPath(
  {emitter, values, deleted}: Form,
  path: Path,
  value: any
): void {
  values.set(path.key, value);
  reviveBranch(deleted, path);
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
  {key}: Path
): void {
  validating.delete(key);
  emit(emitter, 'validating');
}

export function setValidatingByPath(
  {emitter, validating}: Form,
  {key}: Path
): void {
  validating.add(key);
  emit(emitter, 'validating');
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
  emit(emitter, 'errors');
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
export function setTouchedByPath({emitter, touched}: Form, {key}: Path): void {
  if (touched.has(key)) return;
  touched.add(key);
  emit(emitter, 'touched');
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

/**
 * Get dirty fields -- fields whose current value differs from initialValues.
 * Keys are user-facing dotted paths ('a.b', 'a.0.c'), unlike the JSON array
 * keys stored in the values Map.
 * @param form
 * @return object mapping each dirty field's dotted path to true
 */
export function getDirtyFields(form: Form): Record<string, boolean> {
  const dirtyFields: Record<string, boolean> = {};
  forEachDirtyField(form, key => {
    dirtyFields[key] = true;
  });
  return dirtyFields;
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
 * Trigger all fields validate.
 * @param form
 */
export function trigger(form: Form): void {
  form.validators.forEach(validator => validator());
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
