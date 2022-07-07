import {create as createEmitter, emit} from '@for-fun/event-emitter';
import createPath from './path';
import {get, set, waitUntil} from './util';

/** @typedef { import('../index').Form } Form */
/** @typedef { import('../index').Options } Options */
/** @typedef { import('../index').Path } Path */
/** @typedef { import('../index').Name } Name */

/**
 * Create form instance
 * @param {Options} [options]
 * @return {Form}
 */
export default function create(options) {
  const emitter = createEmitter();
  return {
    emitter,
    revalidateOnChange: true,
    ...options,
    values: new Map(),
    errors: new Map(),
    touched: new Set(),
    validators: new Map(),
    validating: new Set()
  };
}

/**
 * Get form values
 * @param {Form} form
 */
export function getValues({defaultValues, values}) {
  return Array.from(values.keys()).reduce(
    (v, k) => set(v, JSON.parse(k), values.get(k)),
    defaultValues
  );
}

/**
 * Get field value
 * @param {Form} form
 * @param {Name} name
 */
export function getValue(form, name) {
  return getValueByPath(form, createPath(name));
}

/**
 * Get field value by path
 * @param {Form} form
 * @param {Path} path
 */
export function getValueByPath({defaultValues, values}, path) {
  if (values.has(path.key)) return values.get(path.key);
  return get(defaultValues, path.value);
}

/**
 * Set field value
 * @param {Form} form
 * @param {Name} name
 * @param {any} value
 */
export function setValue(form, name, value) {
  setValueByPath(form, createPath(name), value);
}

/**
 * Set field value
 * @param {Form} form
 * @param {Path} path
 * @param {any} value
 */
export function setValueByPath({emitter, values}, path, value) {
  values.set(path.key, value);
  emit(emitter, 'change', path);
}

/**
 * Get field error
 * @param {Form} form
 * @param {Name} name
 */
export function getError(form, name) {
  return getErrorByPath(form, createPath(name));
}

/**
 * Get field error by path
 * @param {Form} form
 * @param {Path} path
 */
export function getErrorByPath({errors}, path) {
  return errors.get(path.key);
}

/**
 * Get all errors
 * @param {Form} form
 * @return {string[]}
 */
export function getErrors({errors}) {
  return Array.from(errors.values());
}

/**
 * Get first error string
 * @param {Form} form
 * @return {string}
 */
export function getFirstError({errors}) {
  return errors.values().next().value;
}

export function unsetValidatingByPath({emitter, validating}, {key}) {
  validating.delete(key);
  emit(emitter, 'validating');
}

export function setValidatingByPath({emitter, validating}, {key}) {
  validating.add(key);
  emit(emitter, 'validating');
}

/**
 * Set field error
 * @param {Form} form
 * @param {Name} name
 * @param {string | undefined} error
 */
export function setError(form, name, error) {
  setErrorByPath(form, createPath(name), error);
}

/**
 * Set field error
 * @param {Form} form
 * @param {Path} path
 * @param {string | undefined} error
 */
export function setErrorByPath({emitter, errors}, path, error) {
  if (error) {
    errors.set(path.key, error);
  } else {
    errors.delete(path.key);
  }
  emit(emitter, 'errors');
}

/**
 * Clear errors
 * @param {Form} form
 */
export function clearErrors({emitter, errors}) {
  errors.clear();
  emit(emitter, 'errors');
}

/**
 * Set field touched state
 * @param {Form} form
 * @param {Name} name
 */
export function setTouched(form, name) {
  setTouchedByPath(form, createPath(name));
}

/**
 * Set field touched state
 * @param {Form} form
 * @param {Path} path
 */
export function setTouchedByPath({emitter, touched}, {key}) {
  if (touched.has(key)) return;
  touched.add(key);
  emit(emitter, 'touched');
}

/**
 * Set field touched state
 * @param {Form} form
 * @param {Name} name
 */
export function hasTouched(form, name) {
  return hasTouchedByPath(form, createPath(name));
}

/**
 * Set field touched state
 * @param {Form} form
 * @param {Path} path
 */
export function hasTouchedByPath({touched}, path) {
  return touched.has(path.key);
}

/**
 * Is dirty
 * @param {Form} form
 */
export function isDirty({touched}) {
  return touched.size > 0;
}

/**
 * Remove field
 * @param {Form} form
 * @param {Name} name
 */
export function removeField(form, name) {
  removeFieldByPath(form, createPath(name));
}

/**
 * Remove field
 * @param {Form} form
 * @param {Path} path
 */
export function removeFieldByPath(form, {key}) {
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
 * Set form defaultValues
 * @param {Form} form
 * @param {Object} [defaultValues]
 */
export function setDefaultValues(form, defaultValues) {
  if (form.defaultValues === defaultValues) return;
  form.defaultValues = defaultValues;
  emit(form.emitter, 'change');
}

/**
 * Reset form
 * @param {Form} form
 * @param {Object} [defaultValues]
 */
export function reset(form, defaultValues) {
  form.defaultValues = defaultValues;
  clearErrors(form);
  const {emitter, touched, values} = form;
  values.clear();
  touched.clear();
  emit(emitter, 'change');
  emit(emitter, 'touched');
  emit(emitter, 'reset');
}

/**
 * @param {Form} form
 */
export function hasErrors({errors}) {
  return errors.size > 0;
}

/**
 * Trigger all fields validate.
 * @param {Form} form
 */
export function trigger(form) {
  form.validators.forEach(validator => validator());
}

/**
 * Validate and throw if any field error.
 * @param {Form} form
 * @return {Promise} resolve if no error; reject and stop validate if has an error;
 */
export async function ensureValidate(form) {
  form.validators.forEach((validator, key) => {
    validator();
    if (hasErrors(form)) throw new Error(form.errors.get(key));
  });

  return waitUntil(
    form.emitter,
    'validating',
    () => !form.validating.size,
    () => hasErrors(form)
  ).catch(() => {
    throw new Error(getFirstError(form));
  });
}

/**
 * Validate and return if any field error.
 * @param {Form} form
 * @return {Promise<void | string>};
 */
export async function validate(form) {
  return ensureValidate(form).catch(e => e.message);
}
