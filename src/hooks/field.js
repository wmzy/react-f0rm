import {useEffect, useMemo} from 'react';
import {useFormContext} from '../context';
import {removeFieldByPath, setTouchedByPath, setValueByPath} from '../form';
import {useErrorByPath, useValueByPath} from './form';
import usePath from './path';
import useValidate from './validate';

export default function useField({name, defaultValue, validate}) {
  const form = useFormContext();
  const path = usePath(name);

  const validateRef = useValidate(validate, path);

  const handlers = useMemo(() => {
    if (defaultValue !== undefined) setValueByPath(form, path, defaultValue);

    const onChange = v => setValueByPath(form, path, v);
    const onBlur = () => {
      setTouchedByPath(form, path);
      validateRef.current();
    };

    return {onChange, onBlur};
  }, [form, path]);

  useEffect(
    () => () => {
      removeFieldByPath(form, path);
    },
    [path, form]
  );

  const value = useValueByPath(form, path);
  const error = useErrorByPath(form, path);
  return {value, error, ...handlers};
}
