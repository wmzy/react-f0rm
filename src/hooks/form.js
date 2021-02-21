import {useRef, useReducer, useEffect} from 'react';
import {on} from '@for-fun/event-emitter';
import createStore, {
  getError,
  getValue,
  hasErrors,
  hasTouched,
  isDirty
} from '../store';

export default function useForm(defaultValues) {
  const storeRef = useRef();
  storeRef.current = storeRef.current || createStore(defaultValues);
  return storeRef.current;
}

/**
 * @param {EventEmitter} emitter
 * @param {string} event
 * @param {() => any} getter
 */
export function useWatch(emitter, event, getter) {
  const [value, syncValue] = useReducer(getter, getter);

  useEffect(() => on(emitter, event, syncValue), [emitter, event]);
  return value;
}

/**
 * Get field value state
 * @param {Store} store
 * @param {Paths} paths
 */
export function useValue(store, paths) {
  return useWatch(store.emitter, 'change', getValue.bind(null, store, paths));
}

export function useTouched(store, paths) {
  return useWatch(
    store.emitter,
    'touched',
    hasTouched.bind(null, store, paths)
  );
}

export function useError(store, paths) {
  return useWatch(store.emitter, 'errors', getError.bind(null, store, paths));
}

export function useIsDirty(store) {
  return useWatch(store.emitter, 'touched', isDirty.bind(null, store));
}

export function useHasErrors(store) {
  return useWatch(store.emitter, 'errors', hasErrors.bind(null, store));
}
