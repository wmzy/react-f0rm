import {useRef, useReducer, useEffect} from 'react';
import {on} from '@for-fun/event-emitter';
import {get, isEmpty} from '../util';
import createStore from '../store';

export default function useForm(defaultValues) {
  const storeRef = useRef();
  storeRef.current = storeRef.current || createStore(defaultValues);
  return storeRef.current;
}

export function useWatch(store, paths, event) {
  const g = () => get(store, paths);
  const [value, syncValue] = useReducer(g, g);

  useEffect(() => on(store.emitter, event, syncValue), [store.emitter, event]);
  return value;
}

export function useValue(store, paths) {
  return useWatch(store, ['values', ...paths], 'change');
}

export function useTouched(store, paths) {
  return useWatch(store, ['touched', ...paths], 'touched');
}

export function useError(store, paths) {
  return useWatch(store, ['errors', ...paths], 'errors');
}

export function useIsDirty(store) {
  return !!useWatch(store, ['touched'], 'touched');
}

export function useHasError(store) {
  return !isEmpty(useWatch(store, ['errors'], 'errors'));
}
