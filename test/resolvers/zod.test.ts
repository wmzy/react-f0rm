import {describe, it, expect, vi} from 'vitest';
import {
  zodResolver,
  constraintsFromSchema,
  defaultsFromSchema
} from '../../src/resolvers/zod';

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

  it('falls back per issue when code or message is missing', async () => {
    const schema = createMockSchema({
      success: false,
      error: {issues: [{}]}
    });
    const resolver = zodResolver(schema);
    expect(await resolver('')).toEqual([
      {type: 'custom', message: 'Validation failed'}
    ]);
  });
});

// Mock zod v3-shaped schemas: `_def.typeName` / `_def.checks` /
// `_def.innerType` / `_def.shape()` / `_def.type` (array element).
const v3 = (typeName: string, def: Record<string, any> = {}) => ({
  _def: {typeName, ...def}
});
const v3String = (checks: any[] = []) => v3('ZodString', {checks});
const v3Number = (checks: any[] = []) => v3('ZodNumber', {checks});
const v3Object = (shape: Record<string, any>) =>
  v3('ZodObject', {shape: () => shape});
const v3Optional = (innerType: any) => v3('ZodOptional', {innerType});
const v3Nullable = (innerType: any) => v3('ZodNullable', {innerType});
const v3Default = (innerType: any, defaultValue: any) =>
  v3('ZodDefault', {innerType, defaultValue: () => defaultValue});
const v3Array = (element: any, checks: any[] = []) =>
  v3('ZodArray', {type: element, checks});

// Mock zod v4-shaped schemas: `def.type` / `_zod.def.type` and `_zod.checks`
// entries `{_zod: {def: {check: 'greater_than'|'min_length'|…, …}}}` (the
// shapes zod v4 actually ships).
const v4 = (
  type: string,
  def: Record<string, any> = {},
  checks: any[] = []
) => ({
  _zod: {def: {type, ...def}, checks}
});
const v4Check = (check: string, def: Record<string, any>) => ({
  _zod: {def: {check, ...def}}
});

describe('constraintsFromSchema', () => {
  it('maps string checks to minLength/maxLength/pattern with required', () => {
    const schema = v3Object({
      name: v3String([
        {kind: 'min', value: 1},
        {kind: 'max', value: 20},
        {kind: 'regex', regex: /^[a-z]+$/}
      ]),
      code: v3String([{kind: 'regex', regex: /\d+/, message: 'digits only'}])
    });
    expect(constraintsFromSchema(schema)).toEqual({
      name: {
        required: true,
        minLength: 1,
        maxLength: 20,
        pattern: {value: /^[a-z]+$/, message: ''}
      },
      code: {
        required: true,
        pattern: {value: /\d+/, message: 'digits only'}
      }
    });
  });

  it('maps number checks to min/max', () => {
    const schema = v3Object({
      age: v3Number([
        {kind: 'min', value: 18},
        {kind: 'max', value: 120}
      ])
    });
    expect(constraintsFromSchema(schema)).toEqual({
      age: {required: true, min: 18, max: 120}
    });
  });

  it('keeps bounds but drops required for optional/nullable/default fields', () => {
    const schema = v3Object({
      nickname: v3Optional(v3String([{kind: 'min', value: 2}])),
      note: v3Nullable(v3String([{kind: 'max', value: 10}])),
      title: v3Default(v3String([{kind: 'min', value: 1}]), 'x')
    });
    expect(constraintsFromSchema(schema)).toEqual({
      nickname: {minLength: 2},
      note: {maxLength: 10},
      title: {minLength: 1}
    });
  });

  it('walks nested objects into dotted keys', () => {
    const schema = v3Object({
      user: v3Object({name: v3String([{kind: 'min', value: 1}])})
    });
    expect(constraintsFromSchema(schema)).toEqual({
      'user.name': {required: true, minLength: 1}
    });
  });

  it('reads the .shape getter form as well', () => {
    const schema = {
      shape: {a: v3String([{kind: 'min', value: 1}])},
      _def: {typeName: 'ZodObject'}
    };
    expect(constraintsFromSchema(schema)).toEqual({
      a: {required: true, minLength: 1}
    });
  });

  it('lands array element constraints on the de-indexed path', () => {
    const schema = v3Object({
      items: v3Array(v3Object({name: v3String([{kind: 'min', value: 1}])}), [
        {kind: 'min', value: 1}
      ]),
      tags: v3Array(v3String([{kind: 'min', value: 2}]))
    });
    expect(constraintsFromSchema(schema)).toEqual({
      items: {required: true, minLength: 1},
      'items.name': {required: true, minLength: 1},
      tags: {required: true, minLength: 2}
    });
  });

  it('reads zod v4 shapes (def.type and _zod.checks)', () => {
    const schema = {
      shape: {
        age: v4('number', {}, [
          v4Check('greater_than', {value: 18, inclusive: true}),
          v4Check('less_than', {value: 120, inclusive: true})
        ]),
        name: v4('string', {}, [
          v4Check('min_length', {minimum: 1}),
          v4Check('max_length', {maximum: 20}),
          v4Check('string_format', {
            format: 'regex',
            pattern: /^[a-z]+$/
          })
        ]),
        nickname: v4('optional', {
          innerType: v4('string', {}, [v4Check('min_length', {minimum: 2})])
        })
      },
      _zod: {def: {type: 'object'}, checks: []}
    };
    expect(constraintsFromSchema(schema)).toEqual({
      age: {required: true, min: 18, max: 120},
      name: {
        required: true,
        minLength: 1,
        maxLength: 20,
        pattern: {value: /^[a-z]+$/, message: ''}
      },
      nickname: {minLength: 2}
    });
  });

  it('counts unmappable checks for required but skips bare and unrecognized nodes', () => {
    expect(
      constraintsFromSchema(
        v3Object({email: v3String([{kind: 'email'}]), nick: v3String()})
      )
    ).toEqual({email: {required: true}});
    expect(constraintsFromSchema({nope: true})).toEqual({});
    expect(constraintsFromSchema(undefined)).toEqual({});
  });

  it('terminates on circular schemas and walks shared instances at every path', () => {
    const email = v3String([{kind: 'regex', regex: /@/}]);
    const node: any = v3Object({});
    node._def.shape().self = node;
    node._def.shape().a = email;
    node._def.shape().b = email;
    expect(constraintsFromSchema(node)).toEqual({
      a: {required: true, pattern: {value: /@/, message: ''}},
      b: {required: true, pattern: {value: /@/, message: ''}}
    });
  });
});

describe('defaultsFromSchema', () => {
  it('collects ZodDefault values into a nested values tree', () => {
    const schema = v3Object({
      name: v3Default(v3String(), 'anon'),
      profile: v3Object({
        bio: v3Default(v3String(), 'hi'),
        nick: v3Optional(v3Default(v3String(), 'anon-nick')),
        plain: v3String()
      })
    });
    expect(defaultsFromSchema(schema)).toEqual({
      name: 'anon',
      profile: {bio: 'hi', nick: 'anon-nick'}
    });
  });

  it('seeds one array row from the element defaults', () => {
    const schema = v3Object({
      items: v3Array(v3Object({qty: v3Default(v3Number(), 1)}))
    });
    expect(defaultsFromSchema(schema)).toEqual({items: [{qty: 1}]});
  });

  it('omits arrays and objects without any default below', () => {
    const schema = v3Object({
      items: v3Array(v3String()),
      profile: v3Object({nick: v3String()})
    });
    expect(defaultsFromSchema(schema)).toEqual({});
  });

  it('reads zod v4 defaultValue as getter or plain value', () => {
    const schema = {
      shape: {
        a: v4('default', {innerType: {}, defaultValue: () => 1}),
        b: v4('default', {innerType: {}, defaultValue: false})
      },
      _zod: {def: {type: 'object'}, checks: []}
    };
    expect(defaultsFromSchema(schema)).toEqual({a: 1, b: false});
  });

  it('returns {} for unrecognized shapes without throwing', () => {
    expect(defaultsFromSchema({nope: true})).toEqual({});
    expect(defaultsFromSchema(v3Object({a: v3String()}))).toEqual({});
  });

  it('terminates on circular schemas', () => {
    const node: any = v3Object({});
    node._def.shape().self = node;
    expect(defaultsFromSchema(node)).toEqual({});
  });
});
