import {useContext, useEffect} from 'react';
import type {Context} from 'react';
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
import {useErrorByPath, useFieldErrorsByPath, useValueByPath} from './form';
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
  /**
   * Milliseconds to debounce this field's validation kicks. Defaults to 0
   * (validate immediately); while the timer is pending the field counts as
   * validating, so `trigger`/`ensureValidate` wait out the window. Only the
   * last kick inside the window runs the validator.
   */
  validateDebounce?: number;
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
  /** Every error registered for the field, in insertion order — `error`
   * and `errorObject` are its first entry. Empty (and reference-stable)
   * when the field has no errors. */
  errors: FieldError[];
  onChange: (v: any) => void;
  onBlur: () => void;
  name: string;
  [key: string]: any;
}

/**
 * Shared core of {@link useField} and the per-instance hooks returned by
 * `createFormContext()`: identical behavior, but the form is resolved from
 * whichever Context instance is passed in instead of the module-level one.
 *
 * `form` is always handed to `useValidate` explicitly, and an explicit form
 * wins over `useValidate`'s own context read — so scoped contexts need no
 * changes there.
 */
export function useFieldCore<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
>(
  {
    form: f1,
    name,
    initialValue,
    shouldUnregister,
    validate,
    validateDebounce,
    ...rest
  }: UseFieldOptions<TValues, TPath>,
  Context: Context<any>
): UseFieldResult<TValues, TPath> {
  // Read the context unconditionally (hook call order must be stable), then
  // let an explicitly passed form win — works without a <FormProvider>.
  const contextForm = useContext(Context);
  const form = f1 || contextForm;
  if (!form) throw new Error('no form provided');
  const path = usePath(name);

  // validateDebounce is destructured above so it never leaks into `rest`
  // (and from there onto DOM elements via Field's prop spread).
  const validator = useValidate(validate, path, form, {
    debounce: validateDebounce
  });

  const errorObject = useErrorByPath(form, path);
  const error = errorObject?.message;
  // All errors of the field, same subscription the first-error read uses;
  // the array reference is stable (stored array or shared empty constant),
  // so consumers can memo on it.
  const errors = useFieldErrorsByPath(form, path);
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
    errors,
    onChange,
    onBlur,
    name: path.key
  };
}

export default function useField<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
>(options: UseFieldOptions<TValues, TPath>): UseFieldResult<TValues, TPath> {
  return useFieldCore(options, FormContext);
}
