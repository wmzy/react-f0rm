import {create as createEmitter, emit} from '@for-fun/event-emitter';
import {get, set} from './util';
import createCounter, {waitUntil, isRunning} from './task-counter';

/** @typedef { import('../index').Store } Store */
/** @typedef { import('../index').Paths } Paths */

/**
 * Create form store
 * @param {Object} [defaultValues] default values
 * @return {Store}
 */
export default function create(defaultValues) {
  const emitter = createEmitter();
  return {
    emitter,
    validatingCount: 0,
    defaultValues,
    values: new Map(),
    errors: new Map(),
    touched: new Set()
  };
}

/**
 * Get form values
 * @param {Store} store
 */
export function getValues({defaultValues, values}) {
  return values
    .keys()
    .reduce((k, v) => set(v, JSON.parse(k), values.get(k)), defaultValues);
}

/**
 * Get field value
 * @param {Store} store
 * @param {Paths} paths
 */
export function getValue({defaultValues, values}, paths) {
  const key = JSON.stringify(paths);
  if (values.has(key)) return values.get(key);
  return get(defaultValues, paths);
}

/**
 * Set field value
 * @param {Store} store
 * @param {Paths} paths
 * @param {any} value
 */
export function setValue({emitter, values}, paths, value) {
  const key = JSON.stringify(paths);
  values.set(key, value);
  emit(emitter, 'change');
}

/**
 * Get field error
 * @param {Store} store
 * @param {Paths} paths
 */
export function getError({errors}, paths) {
  return errors.get(JSON.stringify(paths));
}

/**
 * Set field error
 * @param {Store} store
 * @param {Paths} paths
 * @param {string | undefined} error
 */
export function setError({emitter, errors}, paths, error) {
  errors.set(JSON.stringify(paths), error);
  emit(emitter, 'errors');
}

/**
 * Clear errors
 * @param {Store} store
 */
export function clearErrors({emitter, errors}) {
  errors.clear();
  emit(emitter, 'errors');
}

/**
 * Set field touched state
 * @param {Store} store
 * @param {Paths} paths
 */
export function setTouched({emitter, touched}, paths) {
  touched.add(JSON.stringify(paths));
  emit(emitter, 'touched');
}

/**
 * Set field touched state
 * @param {Store} store
 * @param {Paths} paths
 */
export function hasTouched({touched}, paths) {
  return touched.has(JSON.stringify(paths));
}

/**
 * Is dirty
 * @param {Store} store
 */
export function isDirty({touched}) {
  return touched.size > 0;
}

/**
 * Remove field
 * @param {Store} store
 * @param {Paths} paths
 */
export function removeField(store, paths) {
  const key = JSON.stringify(paths);
  const {emitter, values, touched, errors} = store;
  values.delete(key);
  touched.delete(key);
  errors.delete(key);
  emit(emitter, 'change');
  emit(emitter, 'touched');
  emit(emitter, 'errors');
}

/**
 * Reset form
 * @param {Store} store
 * @param {Object} [defaultValues]
 */
export function reset(store, defaultValues) {
  store.defaultValues = defaultValues;
  clearErrors(store);
  const {emitter, touched} = store;
  touched.clear();
  emit(emitter, 'change');
  emit(emitter, 'touched');
  emit(emitter, 'reset');
}

/**
 * @param {Store} store
 */
export function hasErrors({errors}) {
  return errors.size > 0;
}

/**
 * Validate all fields.
 * @param {Store} store
 * @return {Promise} resolve if no error; reject and stop validate if has an error;
 */
export function validate(store) {
  const token = createCounter();
  emit(store.emitter, 'validate', token);

  if (hasErrors(store)) return Promise.reject();
  if (!isRunning(token)) return Promise.resolve();

  return waitUntil(token, () => hasErrors(store));
}
