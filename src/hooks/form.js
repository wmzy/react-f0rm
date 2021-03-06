import {useRef, useReducer, useEffect} from 'react';
import {on, emit} from '@for-fun/event-emitter';
import createForm, {
  getErrorByPath,
  getValueByPath,
  hasTouchedByPath,
  hasErrors,
  isDirty
} from '../form';
import createPath from '../path';

/** @typedef { import('@for-fun/event-emitter').EventEmitter } EventEmitter */
/** @typedef { import('../../index').Form } Form */
/** @typedef { import('../../index').Path } Path */
/** @typedef { import('../../index').Name } Name */

export default function useForm(defaultValues) {
  const ref = useRef(null);
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
 * @param {Name} name
 */
export function useValue(form, name) {
  return useValueByPath(form, createPath(name));
}

/**
 * Get field value state
 * @param {Form} form
 * @param {Path} path
 */
export function useValueByPath(form, path) {
  return useWatch(
    form.emitter,
    'change',
    getValueByPath.bind(null, form, path)
  );
}

/**
 * Get field touched state
 * @param {Form} form
 * @param {Name} name
 */
export function useTouched(form, name) {
  return useTouchedByPath(form, createPath(name));
}

/**
 * Get field touched state
 * @param {Form} form
 * @param {Path} path
 */
export function useTouchedByPath(form, path) {
  return useWatch(
    form.emitter,
    'touched',
    hasTouchedByPath.bind(null, form, path)
  );
}

/**
 * Get field error state
 * @param {Form} form
 * @param {Name} name
 */
export function useError(form, name) {
  return useErrorByPath(form, createPath(name));
}

/**
 * Get field error state
 * @param {Form} form
 * @param {Path} path
 */
export function useErrorByPath(form, path) {
  return useWatch(
    form.emitter,
    'errors',
    getErrorByPath.bind(null, form, path)
  );
}

export function useIsDirty(form) {
  return useWatch(form.emitter, 'touched', isDirty.bind(null, form));
}

export function useHasErrors(form) {
  return useWatch(form.emitter, 'errors', hasErrors.bind(null, form));
}
