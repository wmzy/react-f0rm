import type {Validator} from '../hooks/validate';

export function yupResolver(schema: any): Validator {
  return async (value: any) => {
    try {
      await schema.validate(value);
      return undefined;
    } catch (err: any) {
      return err.message;
    }
  };
}
