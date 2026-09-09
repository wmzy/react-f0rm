// Tests for src/resolvers/standard-schema.ts — Standard Schema v1 adapters
// (https://standardschema.dev, implemented by zod v3.24+/v4, valibot v1 and
// arktype). New file because the module is a new export surface with no
// existing corresponding test file; mocks emulate the '~standard' interface,
// so no schema library is installed. If test-file placement rules tighten,
// merge the resolver cases into test/resolvers/zod.test.ts (zod implements
// the same interface) and keep the form-validator cases in test/form.test.js.
import {describe, it, expect} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import * as React from 'react';
import {
  standardSchemaResolver,
  standardSchemaFormValidator,
  hasStandardProps
} from '../../src/resolvers/standard-schema';
import Form from '../../src/components/Form';
import {Field} from '../../src/components/Field';
import createForm, {
  ensureValidate,
  FORM_ERROR,
  getError,
  getFieldErrors,
  getValues
} from '../../src/form';

type MockIssue = {message: string; path?: (PropertyKey | {key: PropertyKey})[]};

// Mock Standard Schema v1 schema (zod/valibot/arktype style): records every
// validate call in `calls`, returns the given `issues` when non-empty, and
// otherwise succeeds — echoing the input, or `parsed` when given (to
// emulate z.coerce.number()/transform whose output differs from the input).
function mockSchema(issues: MockIssue[], parsed?: unknown) {
  const calls: unknown[] = [];
  return {
    calls,
    '~standard': {
      version: 1,
      vendor: 'mock',
      validate: (value: unknown) => {
        calls.push(value);
        return Promise.resolve(
          issues.length ? {issues} : {value: parsed ?? value}
        );
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
  it('returns the parsed values on success', async () => {
    const validator = standardSchemaFormValidator(mockSchema([]));
    const outcome = await validator({a: 1});
    expect(outcome.values).toEqual({a: 1});
    expect(outcome.errors).toBeUndefined();
  });

  it('nests issues by path (issue.path=["a","b"] → {a: {b: FieldError[]}})', async () => {
    const validator = standardSchemaFormValidator(
      mockSchema([{message: 'required', path: ['a', 'b']}])
    );
    expect((await validator({})).errors).toEqual({
      a: {b: [{type: 'standard', message: 'required'}]}
    });
  });

  it('maps {key} path segments and stringifies numeric segments', async () => {
    const validator = standardSchemaFormValidator(
      mockSchema([{message: 'required', path: [{key: 'items'}, 0, 'name']}])
    );
    expect((await validator({})).errors).toEqual({
      items: {'0': {name: [{type: 'standard', message: 'required'}]}}
    });
  });

  it('puts every pathless issue on the _form key', async () => {
    const validator = standardSchemaFormValidator(
      mockSchema([{message: 'form broken'}, {message: 'later'}])
    );
    expect((await validator({})).errors).toEqual({
      [FORM_ERROR]: [
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
    expect((await validator({})).errors).toEqual({
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
    expect((await validator({})).errors).toEqual({
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
    expect(getError(form, FORM_ERROR)).toEqual({
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

  it('reads the coerced value (z.coerce.number() style) from getValues', async () => {
    // z.object({age: z.coerce.number()}) parses the raw string '25' into
    // the number 25: after a passing validation the form's values are the
    // schema's output, not the pre-coerce input.
    const schema = mockSchema([], {age: 25});
    const form = createForm({
      initialValues: {age: '25'},
      validate: standardSchemaFormValidator(schema)
    });
    await expect(ensureValidate(form)).resolves.toBeUndefined();
    const {age} = getValues(form);
    expect(typeof age).toBe('number');
    expect(age).toBe(25);
  });

  it('reads transformed schema output (z.string().trim() style)', async () => {
    const schema = mockSchema([], {name: 'ann'});
    const form = createForm({
      initialValues: {name: '  ann '},
      validate: standardSchemaFormValidator(schema)
    });
    await expect(ensureValidate(form)).resolves.toBeUndefined();
    expect(getValues(form)).toEqual({name: 'ann'});
  });

  it('keeps raw values and sets no parsedValues when validation fails', async () => {
    const schema = mockSchema([{message: 'required', path: ['age']}]);
    const form = createForm({
      initialValues: {age: '25'},
      validate: standardSchemaFormValidator(schema)
    });
    await expect(ensureValidate(form)).rejects.toThrow('required');
    expect(form.parsedValues).toBeUndefined();
    expect(getValues(form)).toEqual({age: '25'});
  });

  it('receives the current form values', async () => {
    const schema = mockSchema([]);
    const validator = standardSchemaFormValidator(schema);
    await validator({a: {b: 'typed'}});
    expect(schema.calls).toEqual([{a: {b: 'typed'}}]);
  });

  it('yields undefined parsed values when the success result has no value key', async () => {
    // A minimal Standard Schema implementation may resolve with a bare
    // success object; the outcome must carry values: undefined, not throw.
    const schema = {
      '~standard': {version: 1, vendor: 'mock', validate: () => ({})}
    };
    const validator = standardSchemaFormValidator(schema);
    const outcome = await validator({});
    expect(outcome.values).toBeUndefined();
    expect(outcome.errors).toBeUndefined();
  });

  it('keeps the leaf error when a later issue nests under it', async () => {
    // 'a' already holds a FieldError[] leaf; walking into ['a','b'] must
    // stop instead of corrupting the leaf.
    const validator = standardSchemaFormValidator(
      mockSchema([
        {message: 'leaf', path: ['a']},
        {message: 'child', path: ['a', 'b']}
      ])
    );
    const outcome = await validator({});
    expect(outcome.errors).toEqual({a: [{type: 'standard', message: 'leaf'}]});
  });

  it('falls back to a default message for a pathless issue without one', async () => {
    const validator = standardSchemaFormValidator(
      mockSchema([{path: []} as MockIssue])
    );
    const outcome = await validator({});
    expect(outcome.errors).toEqual({
      [FORM_ERROR]: [{type: 'standard', message: 'Validation failed'}]
    });
  });
});

describe('direct schema support (createForm/useField validate: schema)', () => {
  it('createForm({validate: schema}) lands per-path issues and pathless issues on _form', async () => {
    const form = createForm({
      initialValues: {a: {b: ''}, c: 1},
      validate: mockSchema([
        {message: 'required', path: ['a', 'b']},
        {message: 'form broken'}
      ])
    });
    await expect(ensureValidate(form)).rejects.toThrow('required');
    expect(getError(form, 'a.b')).toEqual({
      type: 'standard',
      message: 'required'
    });
    expect(getError(form, FORM_ERROR)).toEqual({
      type: 'standard',
      message: 'form broken'
    });
  });

  it('createForm({validate: schema}) lands the coerced output as values', async () => {
    // z.object({age: z.coerce.number()}) against '25' -> {age: 25}.
    const schema = mockSchema([], {age: 25});
    const form = createForm({
      initialValues: {age: '25'},
      validate: schema
    });
    await expect(ensureValidate(form)).resolves.toBeUndefined();
    const {age} = getValues(form);
    expect(typeof age).toBe('number');
    expect(age).toBe(25);
  });

  it('createForm({validate: fn}) keeps the function path unchanged', async () => {
    const form = createForm({
      initialValues: {a: ''},
      validate: values => (values.a ? {} : {a: 'required'})
    });
    await expect(ensureValidate(form)).rejects.toThrow('required');
  });

  it('hasStandardProps detects the spec contract', () => {
    expect(hasStandardProps(mockSchema([]))).toBe(true);
    expect(hasStandardProps(() => undefined)).toBe(false);
    expect(hasStandardProps({})).toBe(false);
    expect(hasStandardProps(null)).toBe(false);
  });

  it('Field validate: schema reports issues and keeps the raw value', async () => {
    const schema = mockSchema([{message: 'expected a number'}]);
    const form = createForm({initialValues: {age: ''}, mode: 'onChange'});
    render(
      <Form form={form}>
        <Field name="age" validate={schema} renderError={e => e} />
      </Form>
    );
    const input = screen.getByRole('textbox');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    fireEvent.change(input, {target: {value: 'abc'}});
    await screen.findByText('expected a number');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    // Field-level schemas validate only: the store keeps the raw value.
    expect(getValues(form)).toEqual({age: 'abc'});
  });

  it('a failing required gate short-circuits the schema validator', async () => {
    const schema = mockSchema([]);
    const form = createForm({initialValues: {email: ''}, mode: 'onChange'});
    render(
      <Form form={form}>
        <Field
          name="email"
          rules={{required: 'email required'}}
          validate={schema}
          renderError={e => e}
        />
      </Form>
    );
    const input = screen.getByRole('textbox');
    // A write that passes the gate runs the schema (no issues here); the
    // following clear fails the gate, and the gate's error must land
    // without the schema ever seeing the empty value.
    fireEvent.change(input, {target: {value: 'x'}});
    await screen.findByDisplayValue('x');
    fireEvent.change(input, {target: {value: ''}});
    await screen.findByText('email required');
    expect(schema.calls).toEqual(['x']);
  });
});
