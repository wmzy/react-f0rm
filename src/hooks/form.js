import {useRef, useReducer, useEffect} from 'react';
import {on, emit} from '@for-fun/event-emitter';
import createForm, {
  getError,
  getValue,
  hasErrors,
  hasTouched,
  isDirty
} from '../form';

/** @typedef { import('@for-fun/event-emitter').EventEmitter } EventEmitter */
/** @typedef { import('../../index').Form } Form */
/** @typedef { import('../../index').Paths } Paths */

export default function useForm(defaultValues) {
  const ref = useRef();
  const form = (ref.current = ref.current || createForm());

  useEffect(() => {
    form.defaultValues = defaultValues;
    emit(form.emitter, 'change');
  }, [defaultValues]);

  return form;
}

/**
 * @param {EventEmitter} emitter
 * @param {string} event
 * @param {() => any} getter
 */
export function useWatch(emitter, event, getter) {
  const [value, syncValue] = useReducer(getter, undefined, getter);

  useEffect(() => on(emitter, event, syncValue), [emitter, event]);
  return value;
}

/**
 * Get field value state
 * @param {Form} form
 * @param {Paths} paths
 */
export function useValue(form, paths) {
  return useWatch(form.emitter, 'change', getValue.bind(null, form, paths));
}

export function useTouched(form, paths) {
  return useWatch(form.emitter, 'touched', hasTouched.bind(null, form, paths));
}

export function useError(form, paths) {
  return useWatch(form.emitter, 'errors', getError.bind(null, form, paths));
}

export function useIsDirty(form) {
  return useWatch(form.emitter, 'touched', isDirty.bind(null, form));
}

export function useHasErrors(form) {
  return useWatch(form.emitter, 'errors', hasErrors.bind(null, form));
}
