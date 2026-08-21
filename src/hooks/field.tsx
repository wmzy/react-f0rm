import {useContext, useEffect} from 'react';
import {FormContext} from '../context';
import {
  getValueByPath,
  hasTouchedByPath,
  removeFieldByPath,
  setTouchedByPath,
  setValueByPath
} from '../form';
import type {FieldError, Form} from '../form';
import type {Name, Path} from '../path';
import type {FieldPath, PathValueOf} from '../types';
import {useErrorByPath, useValueByPath} from './form';
import usePath from './path';
import useValidate from './validate';
import type {Validator} from './validate';
import {useStageFn} from './stage';

export interface UseFieldOptions<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
> {
  form?: Form<TValues>;
  name: TPath;
  initialValue?: any;
  shouldUnregister?: boolean;
  validate?: Validator;
  [key: string]: any;
}

export interface UseFieldResult<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
> {
  /** The form instance this field is bound to (explicit prop or context) —
   * handy for consumers that need direct access to the headless API. */
  form: Form<TValues>;
  value: PathValueOf<TValues, TPath>;
  /** Error message string (FieldError#message) for display, or undefined */
  error: string | undefined;
  /** Full FieldError object ({type, message}), or undefined */
  errorObject: FieldError | undefined;
  onChange: (v: any) => void;
  onBlur: () => void;
  name: string;
  [key: string]: any;
}

export default function useField<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
>({
  form: f1,
  name,
  initialValue,
  shouldUnregister,
  validate,
  ...rest
}: UseFieldOptions<TValues, TPath>): UseFieldResult<TValues, TPath> {
  // Read the context unconditionally (hook call order must be stable), then
  // let an explicitly passed form win — works without a <FormProvider>.
  const contextForm = useContext(FormContext);
  const form = f1 || contextForm;
  if (!form) throw new Error('no form provided');
  const path = usePath(name);

  const validator = useValidate(validate, path, form);

  const errorObject = useErrorByPath(form, path);
  const error = errorObject?.message;
  const value = useValueByPath(form, path);

  // Seed initialValue in an effect (never during render, so no 'change' is
  // emitted while rendering) and only when the field has no value yet, so
  // user input survives re-renders and remounts.
  useEffect(() => {
    if (initialValue === undefined) return;
    if (getValueByPath(form, path) === undefined) {
      setValueByPath(form, path, initialValue);
    }
  }, [form, path, initialValue]);

  const onChange = useStageFn((v: any) => {
    setValueByPath(form, path, v);
    if (
      form.mode === 'onChange' ||
      form.mode === 'all' ||
      (form.mode === 'onTouched' && hasTouchedByPath(form, path)) ||
      (error !== undefined && form.reValidateMode === 'onChange')
    )
      validator();
  });

  const onBlur = useStageFn(() => {
    setTouchedByPath(form, path);
    if (
      form.mode === 'onBlur' ||
      form.mode === 'onTouched' ||
      form.mode === 'all' ||
      (error !== undefined && form.reValidateMode === 'onBlur')
    )
      validator();
  });

  useEffect(
    () => () => {
      if (shouldUnregister !== false) {
        removeFieldByPath(form, path);
      }
    },
    [path, form, shouldUnregister]
  );

  return {
    ...rest,
    form,
    value,
    error,
    errorObject,
    onChange,
    onBlur,
    name: path.key
  };
}
