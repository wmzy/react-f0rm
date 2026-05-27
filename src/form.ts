import {create as createEmitter, emit as _emit} from '@for-fun/event-emitter';
import type {EventEmitter} from '@for-fun/event-emitter';

const emit = _emit as (emitter: EventEmitter, event: string, ...args: any[]) => void;
import createPath from './path';
import type {Path} from './path';
import {get, set, waitUntil} from './util';

export type PathValue = (string | number)[];
export type Name = string | PathValue;

export interface Form<T extends Record<string, any> = any> {
  emitter: EventEmitter;
  revalidateOnChange: boolean;
  initialValues: T;
  values: Map<string, any>;
  errors: Map<string, string>;
  touched: Set<string>;
  validators: Map<string, () => void>;
  validating: Set<string>;
  validate?: (values: T) => Record<string, string> | Promise<Record<string, string>>;
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
  validate?: (values: T) => Record<string, string> | Promise<Record<string, string>>;
};

/**
 * Create form instance
 * @param options
 * @return form instance
 */
export default function create<T extends Record<string, any> = any>(options?: Options<T>): Form<T> {
  const emitter = createEmitter();
  return {
    emitter,
    revalidateOnChange: true,
    ...options,
    initialValues: (options?.initialValues ?? {}) as T,
    values: new Map(),
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
 * Get form values
 * @param form
 */
export function getValues(form: Form): any {
  return Array.from(form.values.keys()).reduce(
    (v, k) => set(v, JSON.parse(k), form.values.get(k)),
    form.initialValues
  );
}

/**
 * Get field value
 * @param form
 * @param name
 */
export function getValue(form: Form, name: Name): any {
  return getValueByPath(form, createPath(name));
}

/**
 * Get field value by path
 * @param form
 * @param path
 */
export function getValueByPath({initialValues, values}: Form, path: Path): any {
  if (values.has(path.key)) return values.get(path.key);
  return get(initialValues, path.value);
}

/**
 * Set field value
 * @param form
 * @param name
 * @param value
 */
export function setValue(form: Form, name: Name, value: any): void {
  setValueByPath(form, createPath(name), value);
}

/**
 * Set field value
 * @param form
 * @param path
 * @param value
 */
export function setValueByPath({emitter, values}: Form, path: Path, value: any): void {
  values.set(path.key, value);
  emit(emitter, 'change', path);
}

/**
 * Get field error
 * @param form
 * @param name
 */
export function getError(form: Form, name: Name): string | undefined {
  return getErrorByPath(form, createPath(name));
}

/**
 * Get field error by path
 * @param form
 * @param path
 */
export function getErrorByPath({errors}: Form, path: Path): string | undefined {
  return errors.get(path.key);
}

/**
 * Get all errors
 * @param form
 * @return array of error strings
 */
export function getErrors({errors}: Form): string[] {
  return Array.from(errors.values());
}

/**
 * Get first error string
 * @param form
 * @return first error string or undefined
 */
export function getFirstError({errors}: Form): string | undefined {
  return errors.values().next().value;
}

export function unsetValidatingByPath({emitter, validating}: Form, {key}: Path): void {
  validating.delete(key);
  emit(emitter, 'validating');
}

export function setValidatingByPath({emitter, validating}: Form, {key}: Path): void {
  validating.add(key);
  emit(emitter, 'validating');
}

/**
 * Set field error
 * @param form
 * @param name
 * @param error
 */
export function setError(form: Form, name: Name, error: string | undefined): void {
  setErrorByPath(form, createPath(name), error);
}

/**
 * Set field error
 * @param form
 * @param path
 * @param error
 */
export function setErrorByPath({emitter, errors}: Form, path: Path, error: string | undefined): void {
  if (error) {
    errors.set(path.key, error);
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
export function hasTouched(form: Form, name: Name): boolean {
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
export function isDirty({initialValues, values}: Form): boolean {
  for (const [key, value] of values) {
    const path = JSON.parse(key);
    if (get(initialValues, path) !== value) return true;
  }
  return false;
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
export function removeFieldByPath(form: Form, {key}: Path): void {
  const {emitter, values, touched, errors, validating} = form;
  values.delete(key);
  touched.delete(key);
  errors.delete(key);
  validating.delete(key);
  emit(emitter, 'change');
  emit(emitter, 'touched');
  emit(emitter, 'errors');
  emit(emitter, 'validating');
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
  const {emitter, touched, values} = form;
  values.clear();
  touched.clear();
  emit(emitter, 'change');
  emit(emitter, 'touched');
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
    const entries = result ? Object.entries(result) : [];
    if (entries.length) {
      entries.forEach(([field, error]) => {
        setError(form, field, error);
      });
      throw new Error(getFirstError(form));
    }
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
