import type {FieldError} from '../form';
import type {Validator} from '../hooks/validate';
import {hasStandardProps, standardSchemaResolver} from './standard-schema';

export function yupResolver(schema: any): Validator {
  // Recent yup versions implement the Standard Schema props — prefer them.
  if (hasStandardProps(schema)) return standardSchemaResolver(schema);
  // Older yup: fall back to the throw-based validate API. abortEarly:false
  // makes yup aggregate every failure into err.inner instead of throwing
  // on the first, so all of a field's errors reach the form.
  return async (value: any) => {
    try {
      await schema.validate(value, {abortEarly: false});
      return undefined;
    } catch (err: any) {
      const issues =
        Array.isArray(err?.inner) && err.inner.length ? err.inner : [err];
      return issues.map((issue: any): FieldError => ({
        type: issue?.type || 'custom',
        message: issue?.message || 'Validation failed'
      }));
    }
  };
}
