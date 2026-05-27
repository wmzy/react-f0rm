import {useCallback, useEffect, useRef} from 'react';
import {on} from '@for-fun/event-emitter';
import {useFormContext} from '../context';
import {
  getValueByPath,
  setErrorByPath,
  setValidatingByPath,
  unsetValidatingByPath
} from '../form';
import {useStageFn} from './stage';
import {isPromise} from '../util';

export default function useValidate(validate, path) {
  const form = useFormContext();
  const lockRef = useRef(null);
  const validateRef = useRef(validate);
  validateRef.current = validate;

  useEffect(() => {
    const validator = () => {
      const fn = validateRef.current;
      if (!fn) return;
      const result = fn(getValueByPath(form, path), {form, path});
      if (!isPromise(result)) {
        setErrorByPath(form, path, result);
        return;
      }
      const lock = (lockRef.current = {});
      setValidatingByPath(form, path);
      result
        .then(error => {
          if (lock === lockRef.current) {
            setErrorByPath(form, path, error);
          }
        })
        .finally(() => {
          if (lock === lockRef.current) {
            unsetValidatingByPath(form, path);
            lockRef.current = null;
          }
        });
    };

    form.validators.set(path.key, validator);
    return () => form.validators.delete(path.key);
  }, [form, path.key]);

  return useStageFn(() => form.validators.get(path.key)?.());
}
