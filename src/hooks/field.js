import {useEffect, useMemo} from 'react';
import {useFormContext} from '../context';
import {removeFieldByKey, setTouchedByKey, setValueByKey} from '../form';
import {normalizePath} from '../util';
import {useError, useValue} from './form';
import useValidate from './validate';

export default function useField({name, defaultValue, validate}) {
  const form = useFormContext();
  const path = normalizePath(name);
  const pathKey = JSON.stringify(path);

  const validateRef = useValidate(validate, pathKey);

  const handlers = useMemo(() => {
    if (defaultValue !== undefined) setValueByKey(form, pathKey, defaultValue);

    const onChange = v => setValueByKey(form, pathKey, v);
    const onBlur = () => {
      setTouchedByKey(form, pathKey);
      validateRef.current();
    };

    return {onChange, onBlur};
  }, [pathKey, form]);

  useEffect(
    () => () => {
      removeFieldByKey(form, pathKey);
    },
    [pathKey, form]
  );

  const value = useValue(form, path);
  const error = useError(form, path);
  return {value, error, ...handlers};
}
