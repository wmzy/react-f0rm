import {useEffect, useMemo} from 'react';
import {useFormContext} from '../context';
import {removeFieldByPath, setTouchedByPath, setValueByPath} from '../form';
import type {Form} from '../form';
import type {Name, Path} from '../path';
import {useErrorByPath, useValueByPath} from './form';
import usePath from './path';
import useValidate from './validate';
import {useStageFn} from './stage';

interface UseFieldOptions {
  form?: Form;
  name: Name;
  initialValue?: any;
  validate?: (value: any, meta: {form: Form; path: Path}) => string | undefined | Promise<string | undefined>;
  [key: string]: any;
}

interface UseFieldResult {
  value: any;
  error: string | undefined;
  onChange: (v: any) => void;
  onBlur: () => void;
  name: string;
  [key: string]: any;
}

export default function useField({
  form: f1,
  name,
  initialValue,
  validate,
  ...rest
}: UseFieldOptions): UseFieldResult {
  const f2 = useFormContext();
  const form = f1 || f2;
  const path = usePath(name);

  const validator = useValidate(validate, path);

  useMemo(() => {
    if (initialValue !== undefined) setValueByPath(form, path, initialValue);
  }, [form, path]);

  const error = useErrorByPath(form, path);
  const value = useValueByPath(form, path);

  const onChange = useStageFn((v: any) => {
    setValueByPath(form, path, v);
    if (
      form.validateOnChange ||
      (form.revalidateOnChange && error && error !== undefined)
    )
      validator();
  });

  const onBlur = useStageFn(() => {
    setTouchedByPath(form, path);
    if (form.validateOnBlur || (form.revalidateOnBlur && error !== undefined))
      validator();
  });

  useEffect(
    () => () => {
      removeFieldByPath(form, path);
    },
    [path, form]
  );

  return {...rest, value, error, onChange, onBlur, name: path.key};
}
