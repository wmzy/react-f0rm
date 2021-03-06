import {useEffect, useRef} from 'react';
import {on} from '@for-fun/event-emitter';
import {useFormContext} from '../context';
import {
  getValueByPath,
  setErrorByPath,
  setValidatingByPath,
  unsetValidatingByPath
} from '../form';
import useStage from './stage';

export default function useValidate(validate, path) {
  const form = useFormContext();
  const lockRef = useRef(null);

  const validateRef = useStage(() => {
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

  useEffect(() => on(form.emitter, 'validate', () => validateRef.current()), [
    form
  ]);
  return validateRef;
}
