import {useEffect, useRef} from 'react';
import {useFormContext} from '../context';
import {
  getValueByPath,
  setErrorByPath,
  setValidatingByPath,
  unsetValidatingByPath
} from '../form';
import type {Form} from '../form';
import type {Path} from '../path';
import {useStageFn} from './stage';
import {isPromise} from '../util';

export type Validator = (
  value: any,
  meta: {form: Form; path: Path}
) => string | undefined | Promise<string | undefined>;

export default function useValidate(
  validate: Validator | undefined,
  path: Path
): () => void {
  const form = useFormContext() as Form;
  const lockRef = useRef<object | null>(null);
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
        .then((error: string | undefined) => {
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
    return () => {
      form.validators.delete(path.key);
    };
  }, [form, path.key]);

  return useStageFn(() => form.validators.get(path.key)?.());
}
