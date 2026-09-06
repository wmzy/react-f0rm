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
import {
  validateValues,
  VALIDATION_OUTCOME,
  formDataFromValues
} from '../src/server';

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

describe('formDataFromValues', () => {
  it('converts primitives, arrays, dates and objects into FormData', () => {
    const fd = formDataFromValues({
      name: 'ada',
      age: 36,
      active: true,
      tags: ['a', 'b'],
      born: new Date('2020-01-02T03:04:05.000Z'),
      meta: {deep: 1},
      nothing: null,
      missing: undefined
    });
    expect(fd.get('name')).toBe('ada');
    expect(fd.get('age')).toBe('36');
    expect(fd.get('active')).toBe('true');
    expect(fd.getAll('tags')).toEqual(['a', 'b']);
    expect(fd.get('born')).toBe('2020-01-02T03:04:05.000Z');
    expect(fd.get('meta')).toBe('{"deep":1}');
    expect(fd.get('nothing')).toBeNull();
    expect(fd.get('missing')).toBeNull();
  });

  it('passes File values through with their name', () => {
    const file = new File(['content'], 'hello.txt', {type: 'text/plain'});
    const fd = formDataFromValues({file});
    const got = fd.get('file') as File;
    expect(got.name).toBe('hello.txt');
    expect(got.type).toBe('text/plain');
    expect(got.size).toBe(file.size);
  });

  it('flattens array-of-files under one key (multi-entry convention)', () => {
    const files = [new File(['1'], 'a.txt'), new File(['2'], 'b.txt')];
    const fd = formDataFromValues({files});
    expect(fd.getAll('files')).toHaveLength(2);
    expect((fd.getAll('files')[0] as File).name).toBe('a.txt');
  });
});
