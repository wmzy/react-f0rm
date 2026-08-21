import type {FieldError} from '../form';
import type {Validator} from '../hooks/validate';
import {hasStandardProps, standardSchemaResolver} from './standard-schema';

export function yupResolver(schema: any): Validator {
  // Recent yup versions implement the Standard Schema props — prefer them.
  if (hasStandardProps(schema)) return standardSchemaResolver(schema);
  // Older yup: fall back to the throw-based validate API.
  return async (value: any) => {
    try {
      await schema.validate(value);
      return undefined;
    } catch (err: any) {
      const error: FieldError = {
        type: err?.type || 'custom',
        message: err?.message || 'Validation failed'
      };
      return error;
    }
  };
}
