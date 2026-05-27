import type {Validator} from '../hooks/validate';

export function zodResolver(schema: any): Validator {
  return async (value: any) => {
    const result = await schema.safeParseAsync(value);
    if (result.success) return undefined;
    return result.error.issues[0]?.message || 'Validation failed';
  };
}
