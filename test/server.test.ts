// Tests for src/server.ts — the `react-f0rm/server` side entry
// (validateValues: validate a payload of values with the pure core, no
// form instance, no React). New file because the module is a new export
// surface with no existing corresponding test file. Everything is
// imported from '../src/server' ONLY — validateValues plus the
// VALIDATION_OUTCOME brand — so the file doubles as proof that the side
// entry is self-sufficient: it never reaches for '../src/form' or the
// root entry, keeping the server module graph pure. If test-file
// placement rules tighten, these cases fold into test/form.test.js's
// trigger coverage (same pipeline) and the import stays pinned to
// '../src/server'.
import {describe, it, expect} from 'vitest';
import {validateValues, VALIDATION_OUTCOME} from '../src/server';

describe('validateValues', () => {
  it('reports a sync error record as invalid with flat entries', async () => {
    const result = await validateValues(
      {email: 'nope'},
      {
        validate: () => ({email: 'Not an email'})
      }
    );
    expect(result.valid).toBe(false);
    // Plain string errors normalize to {type: 'custom'} FieldErrors; the
    // record key flattens to the dotted path — same shape getErrors hands
    // out on the client, and the shape setServerErrors consumes.
    expect(result.errors).toContainEqual({
      path: 'email',
      type: 'custom',
      message: 'Not an email'
    });
  });

  it('returns the input values untouched when valid', async () => {
    const values = {name: 'ada', nested: {count: 1}};
    const result = await validateValues(values, {validate: () => undefined});
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.values).toEqual(values);
  });

  it('awaits an async validate before settling', async () => {
    const result = await validateValues(
      {email: 'nope'},
      {
        // Settles a macrotask later: a round that failed to await the
        // validator's promise would settle early with valid:true and no
        // errors, so the entries below prove the wait happened.
        validate: async () => {
          await new Promise(resolve => setTimeout(resolve, 0));
          return {email: 'Already registered'};
        }
      }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      {path: 'email', type: 'custom', message: 'Already registered'}
    ]);
  });

  it('flows schema-coerced values from a branded outcome', async () => {
    // z.coerce.number() style: the validator parsed '42' into 42; the
    // branded outcome's values become the parsedValues baseline, so
    // result.values carries the coerced tree forward.
    const result = await validateValues<{count: string | number}>(
      {count: '42'},
      {
        validate: () => ({[VALIDATION_OUTCOME]: true, values: {count: 42}})
      }
    );
    expect(result.valid).toBe(true);
    expect(result.values).toEqual({count: 42});
  });
});
