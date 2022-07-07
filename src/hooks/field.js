import {useEffect, useMemo} from 'react';
import {useFormContext} from '../context';
import {removeFieldByPath, setTouchedByPath, setValueByPath} from '../form';
import {useErrorByPath, useValueByPath} from './form';
import usePath from './path';
import useValidate from './validate';
import {useStageFn} from './stage';

export default function useField({form: f1, name, defaultValue, validate, ...rest}) {
  const f2 = useFormContext();
  const form = f1 || f2;
  const path = usePath(name);

  const validator = useValidate(validate, path);

  useMemo(() => {
    if (defaultValue !== undefined) setValueByPath(form, path, defaultValue);
  }, [form, path]);

  const error = useErrorByPath(form, path);
  const value = useValueByPath(form, path);

  const onChange = useStageFn(
    form.validateOnChange ||
      (form.revalidateOnChange && error && error !== undefined)
      ? v => {
          setValueByPath(form, path, v);
          validator();
        }
      : v => setValueByPath(form, path, v)
  );

  const onBlur = useStageFn(
    form.validateOnBlur || (form.revalidateOnBlur && error !== undefined)
      ? () => {
          setTouchedByPath(form, path);
          validator();
        }
      : () => setTouchedByPath(form, path)
  );

  useEffect(
    () => () => {
      removeFieldByPath(form, path);
    },
    [path, form]
  );

  return {...rest, value, error, onChange, onBlur};
}
