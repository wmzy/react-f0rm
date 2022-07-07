import {useCallback, useEffect, useRef} from 'react';
import {on} from '@for-fun/event-emitter';
import {useFormContext} from '../context';
import {
  getValueByPath,
  setErrorByPath,
  setValidatingByPath,
  unsetValidatingByPath
} from '../form';

export default function useValidate(validate, path) {
  const form = useFormContext();
  const lockRef = useRef(null);

  form.validators.set(path.key, () => {
    if (!validate) return;
    const result = validate(getValueByPath(form, path));
    if (typeof result === 'string' || !result) {
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

  useEffect(() => form.validators.delete(path.key), [form, path]);
  return useCallback(() => form.validators.get(path.key)(), [form, path]);
}
