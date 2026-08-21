import {describe, it, expect, vi} from 'vitest';
import {yupResolver} from '../../src/resolvers/yup';

// Mock yup-like schema
function createMockSchema(
  shouldFail: boolean,
  errorMessage?: string,
  errorType?: string
) {
  return {
    validate: (value: any) => {
      if (shouldFail) {
        const err: any = new Error(errorMessage || 'Validation failed');
        if (errorType) err.type = errorType;
        return Promise.reject(err);
      }
      return Promise.resolve(value);
    }
  };
}

describe('yupResolver', () => {
  it('returns undefined on success', async () => {
    const schema = createMockSchema(false);
    const resolver = yupResolver(schema);
    expect(await resolver('value')).toBeUndefined();
  });

  it('returns a FieldError with a custom type when the error has no type', async () => {
    const schema = createMockSchema(true, 'Too short');
    const resolver = yupResolver(schema);
    expect(await resolver('')).toEqual({type: 'custom', message: 'Too short'});
  });

  it('uses the yup error type when present', async () => {
    const schema = createMockSchema(true, 'Too short', 'min');
    const resolver = yupResolver(schema);
    expect(await resolver('')).toEqual({type: 'min', message: 'Too short'});
  });

  it('delegates to the ~standard interface when present (recent yup)', async () => {
    const validate = vi.fn();
    const schema = {
      validate,
      '~standard': {
        version: 1,
        vendor: 'yup',
        validate: () => Promise.resolve({issues: [{message: 'Too short'}]})
      }
    };
    const resolver = yupResolver(schema);
    expect(await resolver('')).toEqual({
      type: 'standard',
      message: 'Too short'
    });
    expect(validate).not.toHaveBeenCalled();
  });
});
