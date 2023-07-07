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

  form.validators.set(path.key, () => {
    if (!validate) return;
    const result = validate(getValueByPath(form, path), {form, path});
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
  });

  useEffect(() => () => form.validators.delete(path.key), [form, path.key]);

  return useStageFn(() => form.validators.get(path.key)());
}
