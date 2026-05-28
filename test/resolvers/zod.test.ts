import {describe, it, expect} from 'vitest';
import {zodResolver} from '../../src/resolvers/zod';

// Mock zod-like schema
function createMockSchema(result: {
  success: boolean;
  error?: {issues: {message: string}[]};
}) {
  return {
    safeParseAsync: () => Promise.resolve(result)
  };
}

describe('zodResolver', () => {
  it('returns undefined on success', async () => {
    const schema = createMockSchema({success: true});
    const resolver = zodResolver(schema);
    expect(await resolver('value')).toBeUndefined();
  });

  it('returns error message on failure', async () => {
    const schema = createMockSchema({
      success: false,
      error: {issues: [{message: 'Too short'}]}
    });
    const resolver = zodResolver(schema);
    expect(await resolver('')).toBe('Too short');
  });
});
