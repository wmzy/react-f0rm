import {describe, it, expect} from 'vitest';
import {yupResolver} from '../../src/resolvers/yup';

// Mock yup-like schema
function createMockSchema(shouldFail: boolean, errorMessage?: string) {
  return {
    validate: (value: any) => {
      if (shouldFail) {
        return Promise.reject(new Error(errorMessage || 'Validation failed'));
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

  it('returns error message on failure', async () => {
    const schema = createMockSchema(true, 'Too short');
    const resolver = yupResolver(schema);
    expect(await resolver('')).toBe('Too short');
  });
});
