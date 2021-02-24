import {useEffect, useMemo, useRef} from 'react';
import {useFormContext} from '../context';
import {getValue, removeField, setError, setTouched, setValue} from '../form';
import {useValue} from './form';

export default function useField({name, defaultValue, validate}) {
  const form = useFormContext();
  const lockRef = useRef();
  const validateRef = useRef();
  validateRef.current = validate;
  const nameKey = JSON.stringify(name);

  const handlers = useMemo(() => {
    setValue(form, name, defaultValue);

    const onChange = v => setValue(form, name, v);
    const onBlur = () => {
      setTouched(form, name);

      if (!validateRef.current) return;
      const result = validateRef.current(getValue(form, name));
      if (!result) return;
      if (typeof result === 'string') {
        setError(form, name, result);
        return;
      }
      const lock = (lockRef.current = {});
      result
        .then(error => {
          if (lock === lockRef.current && error) setError(form, name, error);
        })
        .finally(() => (lockRef.current = null));
    };

    return {onChange, onBlur};
  }, [nameKey, form]);

  useEffect(
    () => () => {
      removeField(form, name);
    },
    [nameKey, form]
  );

  const value = useValue(form, name);
  return {value, ...handlers};
}
