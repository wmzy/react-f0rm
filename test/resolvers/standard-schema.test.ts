// Tests for src/resolvers/standard-schema.ts — Standard Schema v1 adapters
// (https://standardschema.dev, implemented by zod v3.24+/v4, valibot v1 and
// arktype). New file because the module is a new export surface with no
// existing corresponding test file; mocks emulate the '~standard' interface,
// so no schema library is installed. If test-file placement rules tighten,
// merge the resolver cases into test/resolvers/zod.test.ts (zod implements
// the same interface) and keep the form-validator cases in test/form.test.js.
import {describe, it, expect} from 'vitest';
import {
  standardSchemaResolver,
  standardSchemaFormValidator
} from '../../src/resolvers/standard-schema';
import createForm, {
  ensureValidate,
  getError,
  getFieldErrors
} from '../../src/form';

type MockIssue = {message: string; path?: (PropertyKey | {key: PropertyKey})[]};

// Mock Standard Schema v1 schema (zod/valibot/arktype style): records every
// validate call in `calls` and returns the given `issues` when non-empty.
function mockSchema(issues: MockIssue[]) {
  const calls: unknown[] = [];
  return {
    calls,
    '~standard': {
      version: 1,
      vendor: 'mock',
      validate: (value: unknown) => {
        calls.push(value);
        return Promise.resolve(issues.length ? {issues} : {value});
      }
    }
  };
}

describe('standardSchemaResolver', () => {
  it('returns undefined on success', async () => {
    const schema = mockSchema([]);
    const resolver = standardSchemaResolver(schema);
    expect(await resolver('value')).toBeUndefined();
  });

  it('returns a FieldError for every issue on failure', async () => {
    const schema = mockSchema([
      {message: 'First', path: ['a']},
      {message: 'Second', path: ['b']}
    ]);
    const resolver = standardSchemaResolver(schema);
    expect(await resolver('')).toEqual([
      {type: 'standard', message: 'First'},
      {type: 'standard', message: 'Second'}
    ]);
  });

  it('surfaces every rule a value breaks (min + regex style)', async () => {
    // z.string().min(2).regex(/^[a-z]+$/) against '!' violates both rules.
    const schema = mockSchema([{message: 'Too short'}, {message: 'Invalid'}]);
    const resolver = standardSchemaResolver(schema);
    expect(await resolver('!')).toEqual([
      {type: 'standard', message: 'Too short'},
      {type: 'standard', message: 'Invalid'}
    ]);
  });

  it('supports sync validate implementations', async () => {
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'mock',
        validate: (value: unknown) => ({value})
      }
    };
    const resolver = standardSchemaResolver(schema as any);
    expect(await resolver('value')).toBeUndefined();
  });

  it('falls back to a default message when the issue has none', async () => {
    const schema = mockSchema([{path: ['a']} as MockIssue]);
    const resolver = standardSchemaResolver(schema);
    expect(await resolver('')).toEqual([
      {type: 'standard', message: 'Validation failed'}
    ]);
  });
});

describe('standardSchemaFormValidator', () => {
  it('returns an empty object on success', async () => {
    const validator = standardSchemaFormValidator(mockSchema([]));
    expect(await validator({a: 1})).toEqual({});
  });

  it('nests issues by path (issue.path=["a","b"] → {a: {b: FieldError[]}})', async () => {
    const validator = standardSchemaFormValidator(
      mockSchema([{message: 'required', path: ['a', 'b']}])
    );
    expect(await validator({})).toEqual({
      a: {b: [{type: 'standard', message: 'required'}]}
    });
  });

  it('maps {key} path segments and stringifies numeric segments', async () => {
    const validator = standardSchemaFormValidator(
      mockSchema([{message: 'required', path: [{key: 'items'}, 0, 'name']}])
    );
    expect(await validator({})).toEqual({
      items: {'0': {name: [{type: 'standard', message: 'required'}]}}
    });
  });

  it('puts every pathless issue on the _form key', async () => {
    const validator = standardSchemaFormValidator(
      mockSchema([{message: 'form broken'}, {message: 'later'}])
    );
    expect(await validator({})).toEqual({
      _form: [
        {type: 'standard', message: 'form broken'},
        {type: 'standard', message: 'later'}
      ]
    });
  });

  it('collects every issue when paths collide', async () => {
    const validator = standardSchemaFormValidator(
      mockSchema([
        {message: 'first', path: ['a', 'b']},
        {message: 'second', path: ['a', 'b']}
      ])
    );
    expect(await validator({})).toEqual({
      a: {
        b: [
          {type: 'standard', message: 'first'},
          {type: 'standard', message: 'second'}
        ]
      }
    });
  });

  it('drops empty branch objects when a parent path overrides a child', async () => {
    const validator = standardSchemaFormValidator(
      mockSchema([
        {message: 'child', path: ['a', 'b']},
        {message: 'parent', path: ['a']}
      ])
    );
    expect(await validator({})).toEqual({
      a: {b: [{type: 'standard', message: 'child'}]}
    });
  });

  it('flattens nested issues into per-field errors via ensureValidate', async () => {
    const schema = mockSchema([{message: 'required', path: ['a', 'b']}]);
    const form = createForm({
      initialValues: {a: {b: ''}},
      validate: standardSchemaFormValidator(schema)
    });
    await expect(ensureValidate(form)).rejects.toThrow('required');
    expect(getError(form, 'a.b')).toEqual({
      type: 'standard',
      message: 'required'
    });
    expect(getError(form, ['a', 'b'])).toEqual({
      type: 'standard',
      message: 'required'
    });
  });

  it('delivers every issue of one field via ensureValidate', async () => {
    // z.string().min(2).regex(/^[a-z]+$/) against '!': both rules are
    // violated, and both errors must reach the form (getFieldErrors
    // returns them all; getError keeps returning the first).
    const schema = mockSchema([
      {message: 'Too short', path: ['code']},
      {message: 'Invalid characters', path: ['code']}
    ]);
    const form = createForm({
      initialValues: {code: '!'},
      validate: standardSchemaFormValidator(schema)
    });
    await expect(ensureValidate(form)).rejects.toThrow('Too short');
    expect(getFieldErrors(form, 'code')).toEqual([
      {type: 'standard', message: 'Too short'},
      {type: 'standard', message: 'Invalid characters'}
    ]);
    expect(getError(form, 'code')).toEqual({
      type: 'standard',
      message: 'Too short'
    });
  });

  it('exposes pathless issues as the _form field error', async () => {
    const schema = mockSchema([{message: 'form broken'}]);
    const form = createForm({
      initialValues: {a: 1},
      validate: standardSchemaFormValidator(schema)
    });
    await expect(ensureValidate(form)).rejects.toThrow('form broken');
    expect(getError(form, '_form')).toEqual({
      type: 'standard',
      message: 'form broken'
    });
  });

  it('resolves when the schema passes', async () => {
    const schema = mockSchema([]);
    const form = createForm({
      initialValues: {a: {b: ''}},
      validate: standardSchemaFormValidator(schema)
    });
    await expect(ensureValidate(form)).resolves.toBeUndefined();
  });

  it('receives the current form values', async () => {
    const schema = mockSchema([]);
    const validator = standardSchemaFormValidator(schema);
    await validator({a: {b: 'typed'}});
    expect(schema.calls).toEqual([{a: {b: 'typed'}}]);
  });
});
