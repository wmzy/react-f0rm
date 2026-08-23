import type {FieldError} from '../form';
import type {Validator} from '../hooks/validate';
import {hasStandardProps, standardSchemaResolver} from './standard-schema';

export function zodResolver(schema: any): Validator {
  // zod v3.24+/v4 schemas carry the Standard Schema props — prefer them.
  if (hasStandardProps(schema)) return standardSchemaResolver(schema);
  // Older zod: fall back to the legacy safeParseAsync API. It aggregates
  // every issue (no abortEarly), so map them all — a value breaking
  // several rules surfaces all of its errors.
  return async (value: any) => {
    const result = await schema.safeParseAsync(value);
    if (result.success) return undefined;
    const {issues} = result.error;
    if (!issues?.length) {
      return [{type: 'custom', message: 'Validation failed'}];
    }
    return issues.map((issue: any): FieldError => ({
      type: issue?.code || 'custom',
      message: issue?.message || 'Validation failed'
    }));
  };
}
