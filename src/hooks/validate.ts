import {useContext, useEffect, useRef} from 'react';
import {FormContext} from '../context';
import {
  getValueByPath,
  setErrorByPath,
  setValidatingByPath,
  unsetValidatingByPath
} from '../form';
import type {FieldError, Form} from '../form';
import type {Path} from '../path';
import {useStageFn} from './stage';
import {isPromise} from '../util';

export type Validator = (
  value: any,
  meta: {form: Form; path: Path}
) => string | FieldError | undefined | Promise<string | FieldError | undefined>;

export default function useValidate(
  validate: Validator | undefined,
  path: Path,
  formProp?: Form
): () => void {
  // Read the context unconditionally (hook call order must be stable), then
  // let an explicitly passed form win — works without a <FormProvider>.
  const contextForm = useContext(FormContext);
  const form = (formProp || contextForm) as Form;
  if (!form) throw new Error('no form provided');
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
        .then((error: string | FieldError | undefined) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are `path.key` on purpose: usePath returns a stable Path per key, so re-subscribing on key (not object identity) is enough
  }, [form, path.key]);

  return useStageFn(() => form.validators.get(path.key)?.());
}
