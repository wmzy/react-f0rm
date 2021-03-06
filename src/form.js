import {create as createEmitter, emit} from '@for-fun/event-emitter';
import {get, set, waitUntil} from './util';

/** @typedef { import('../index').Form } Form */
/** @typedef { import('../index').Paths } Paths */

/**
 * Create form instance
 * @param {Object} [defaultValues] default values
 * @return {Form}
 */
export default function create(defaultValues) {
  const emitter = createEmitter();
  return {
    emitter,
    validatingCount: 0,
    defaultValues,
    values: new Map(),
    errors: new Map(),
    touched: new Set(),
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
 * @param {Paths} paths
 */
export function getValue({defaultValues, values}, paths) {
  const key = JSON.stringify(paths);
  if (values.has(key)) return values.get(key);
  return get(defaultValues, paths);
}

/**
 * Get field value by path key
 * @param {Form} form
 * @param {string} key
 */
export function getValueByKey({defaultValues, values}, key) {
  if (values.has(key)) return values.get(key);
  // TODO: refactor use WeakMap
  return get(defaultValues, JSON.parse(key));
}

/**
 * Set field value
 * @param {Form} form
 * @param {Paths} paths
 * @param {any} value
 */
export function setValue(form, paths, value) {
  const key = JSON.stringify(paths);
  setValueByKey(form, key, value);
}

export function setValueByKey({emitter, values}, key, value) {
  values.set(key, value);
  emit(emitter, 'change');
}

/**
 * Get field error
 * @param {Form} form
 * @param {Paths} paths
 */
export function getError({errors}, paths) {
  return errors.get(JSON.stringify(paths));
}

/**
 * Get all errors
 * @param {Form} form
 */
export function getErrors({errors}) {
  return Array.from(errors.values());
}

export function unsetValidatingByKey({emitter, validating}, key) {
  validating.delete(key);
  emit(emitter, 'validating');
}

export function setValidatingByKey({emitter, validating}, key) {
  validating.add(key);
  emit(emitter, 'validating');
}

/**
 * Set field error
 * @param {Form} form
 * @param {Paths} paths
 * @param {string | undefined} error
 */
export function setError(form, paths, error) {
  setErrorByKey(form, JSON.stringify(paths), error);
}

export function setErrorByKey({emitter, errors}, key, error) {
  if (error) {
    errors.set(key, error);
  } else {
    errors.delete(key);
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
 * @param {Paths} paths
 */
export function setTouched(form, paths) {
  setTouchedByKey(form, JSON.stringify(paths));
}

export function setTouchedByKey({emitter, touched}, key) {
  touched.add(key);
  emit(emitter, 'touched');
}

/**
 * Set field touched state
 * @param {Form} form
 * @param {Paths} paths
 */
export function hasTouched({touched}, paths) {
  return touched.has(JSON.stringify(paths));
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
 * @param {Paths} paths
 */
export function removeField(form, paths) {
  const key = JSON.stringify(paths);
  removeFieldByKey(form, key);
}

export function removeFieldByKey(form, key) {
  const {emitter, values, touched, errors} = form;
  values.delete(key);
  touched.delete(key);
  errors.delete(key);
  emit(emitter, 'change');
  emit(emitter, 'touched');
  emit(emitter, 'errors');
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
  emit(form.emitter, 'validate');
}

/**
 * Validate all fields.
 * @param {Form} form
 * @return {Promise} resolve if no error; reject and stop validate if has an error;
 */
export function validate(form) {
  trigger(form);

  return waitUntil(
    form.emitter,
    'validating',
    () => !form.validating.size,
    () => hasErrors(form)
  );
}
