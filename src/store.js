import {create as createEmitter, emit} from '@for-fun/event-emitter';
import {get, set} from './util';

export default function create(defaultValues) {
  const emitter = createEmitter();
  return {emitter, values: defaultValues, errors: null, touched: null};
}

export function getValues(store) {
  return store.values;
}

export function setValues(store, values) {
  store.values = values;
  emit(store.emitter, 'change');
}

export function getValue(store, paths) {
  return get(store.values, paths);
}

export function setValue(store, paths, value) {
  store.values = set(store.values, paths, value);
  emit(store.emitter, 'change');
}

export function getErrors(store) {
  return store.errors;
}

export function getError(store, paths) {
  return get(store.errors, paths);
}

export function setError(store, paths, value) {
  store.errors = set(store.errors, paths, value);
  emit(store.emitter, 'errors');
}

export function setErrors(store, errors) {
  store.errors = errors;
  emit(store.emitter, 'errors');
}

export function clearErrors(store) {
  setErrors(store);
}

export function setTouched(store, paths) {
  store.touched = set(store.touched, paths, true);
  emit(store.emitter, 'touched');
}

export function reset(store, values) {
  setValues(store, values);
  clearErrors(store);
  store.touched = null;
  emit(store.emitter, 'touched');
  emit(store.emitter, 'reset');
}
