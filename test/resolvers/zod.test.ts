import {describe, it, expect, vi} from 'vitest';
import {zodResolver} from '../../src/resolvers/zod';

// Mock zod-like schema
function createMockSchema(result: {
  success: boolean;
  error?: {issues: {code?: string; message: string}[]};
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

  it('returns a FieldError for every issue on failure', async () => {
    const schema = createMockSchema({
      success: false,
      error: {
        issues: [
          {code: 'too_small', message: 'Too short'},
          {code: 'invalid_format', message: 'Bad characters'}
        ]
      }
    });
    const resolver = zodResolver(schema);
    expect(await resolver('')).toEqual([
      {type: 'too_small', message: 'Too short'},
      {type: 'invalid_format', message: 'Bad characters'}
    ]);
  });

  it('falls back to a custom type and default message without issues', async () => {
    const schema = createMockSchema({
      success: false,
      error: {issues: []}
    });
    const resolver = zodResolver(schema);
    expect(await resolver('')).toEqual([
      {type: 'custom', message: 'Validation failed'}
    ]);
  });

  it('delegates to the ~standard interface when present (zod v3.24+)', async () => {
    const safeParseAsync = vi.fn();
    const schema = {
      safeParseAsync,
      '~standard': {
        version: 1,
        vendor: 'zod',
        validate: () =>
          Promise.resolve({issues: [{message: 'Too short', path: ['name']}]})
      }
    };
    const resolver = zodResolver(schema);
    expect(await resolver('')).toEqual([
      {type: 'standard', message: 'Too short'}
    ]);
    expect(safeParseAsync).not.toHaveBeenCalled();
  });

  it('returns undefined through the ~standard interface on success', async () => {
    const schema = {
      safeParseAsync: vi.fn(),
      '~standard': {
        version: 1,
        vendor: 'zod',
        validate: (value: unknown) => ({value})
      }
    };
    const resolver = zodResolver(schema);
    expect(await resolver('ok')).toBeUndefined();
    expect(schema.safeParseAsync).not.toHaveBeenCalled();
  });
});
