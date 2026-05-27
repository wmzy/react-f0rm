import {useRef, useReducer, useEffect} from 'react';
import {on} from '@for-fun/event-emitter';
import type {EventEmitter} from '@for-fun/event-emitter';
import createForm, {
  getErrorByPath,
  getValueByPath,
  hasTouchedByPath,
  hasErrors,
  isDirty,
  setInitialValues
} from '../form';
import type {Form, Options, Name} from '../form';
import createPath from '../path';
import type {Path} from '../path';

export default function useForm<T extends Record<string, any> = any>(
  options?: Options<T>
): Form<T> {
  const ref = useRef<Form<T> | null>(null);
  const form = (ref.current = ref.current || createForm(options));
  const initialValues = options && options.initialValues;

  useEffect(() => {
    setInitialValues(form, initialValues);
  }, [initialValues]);

  return form;
}

export function useWatch<T>(
  emitter: EventEmitter,
  event: string,
  getter: () => T
): T {
  const [value, syncValue] = useReducer(getter, undefined, getter);

  useEffect(() => on(emitter, event, syncValue), [emitter, event]);
  return value;
}

/**
 * Get field value state
 */
export function useValue(form: Form, name: Name): any {
  return useValueByPath(form, createPath(name));
}

/**
 * Get field value state by path
 */
export function useValueByPath(form: Form, path: Path): any {
  return useWatch(
    form.emitter,
    'change',
    getValueByPath.bind(null, form, path)
  );
}

/**
 * Get field touched state
 */
export function useTouched(form: Form, name: Name): boolean {
  return useTouchedByPath(form, createPath(name));
}

/**
 * Get field touched state by path
 */
export function useTouchedByPath(form: Form, path: Path): boolean {
  return useWatch(
    form.emitter,
    'touched',
    hasTouchedByPath.bind(null, form, path)
  );
}

/**
 * Get field error state
 */
export function useError(form: Form, name: Name): string | undefined {
  return useErrorByPath(form, createPath(name));
}

/**
 * Get field error state by path
 */
export function useErrorByPath(form: Form, path: Path): string | undefined {
  return useWatch(
    form.emitter,
    'errors',
    getErrorByPath.bind(null, form, path)
  );
}

export function useIsDirty(form: Form): boolean {
  return useWatch(form.emitter, 'touched', isDirty.bind(null, form));
}

export function useHasErrors(form: Form): boolean {
  return useWatch(form.emitter, 'errors', hasErrors.bind(null, form));
}

export function useIsSubmitting(form: Form): boolean {
  return useWatch(form.emitter, 'submitting', () => form.isSubmitting);
}

export function useSubmitCount(form: Form): number {
  return useWatch(form.emitter, 'submitCount', () => form.submitCount);
}
