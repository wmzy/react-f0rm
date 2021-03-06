import {useEffect, useRef} from 'react';
import {on} from '@for-fun/event-emitter';
import {useFormContext} from '../context';
import {
  getValueByKey,
  setErrorByKey,
  setValidatingByKey,
  unsetValidatingByKey
} from '../form';
import useStage from './stage';

export default function useValidate(validate, pathKey) {
  const form = useFormContext();
  const lockRef = useRef(null);

  const validateRef = useStage(() => {
    if (!validate) return;
    const result = validate(getValueByKey(form, pathKey));
    if (typeof result === 'string' || !result) {
      setErrorByKey(form, pathKey, result);
      return;
    }
    const lock = (lockRef.current = {});
    setValidatingByKey(form, pathKey);
    result
      .then(error => {
        if (lock === lockRef.current) {
          setErrorByKey(form, pathKey, error);
        }
      })
      .finally(() => {
        if (lock === lockRef.current) {
          unsetValidatingByKey(form, pathKey);
          lockRef.current = null;
        }
      });
  });

  useEffect(() => on(form.emitter, 'validate', () => validateRef.current()), [
    form
  ]);
  return validateRef;
}
