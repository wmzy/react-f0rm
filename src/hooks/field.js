import {useEffect, useMemo} from 'react';
import {useFormContext} from '../context';
import {removeFieldByPath, setTouchedByPath, setValueByPath} from '../form';
import {useErrorByPath, useValueByPath} from './form';
import usePath from './path';
import useValidate from './validate';
import {useStageFn} from './stage';

/**
 * @param options
 * @type {import('../../index').UseField}
 */
export default function useField({
  form: f1,
  name,
  initialValue,
  validate,
  ...rest
}) {
  const f2 = useFormContext();
  const form = f1 || f2;
  const path = usePath(name);

  const validator = useValidate(validate, path);

  useMemo(() => {
    if (initialValue !== undefined) setValueByPath(form, path, initialValue);
  }, [form, path]);

  const error = useErrorByPath(form, path);
  const value = useValueByPath(form, path);

  const onChange = useStageFn(v => {
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
