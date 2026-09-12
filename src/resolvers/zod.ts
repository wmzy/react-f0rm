import type {FieldError} from '../form';
import type {Validator} from '../hooks/validate';
import type {FieldRules} from '../rules';
import {hasStandardProps, standardSchemaResolver} from './standard-schema';

/** The {@link FieldRules} subset a zod schema can describe declaratively. */
export type SchemaConstraints = Pick<
  FieldRules,
  'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern'
>;

export function zodResolver(schema: any): Validator {
  // zod v3.24+/v4 schemas carry the Standard Schema props — prefer them.
  if (hasStandardProps(schema)) return standardSchemaResolver(schema);
  // Older zod: fall back to the legacy safeParseAsync API. It aggregates
  // every issue (no abortEarly), so map them all — a value breaking
  // several rules surfaces all of its errors.
  return async (value: any) => {
    const result = await schema.safeParseAsync(value);
    if (result.success) return undefined;
    const {issues} = result.error;
    if (!issues?.length) {
      return [{type: 'custom', message: 'Validation failed'}];
    }
    return issues.map((issue: any): FieldError => ({
      type: issue?.code || 'custom',
      message: issue?.message || 'Validation failed'
    }));
  };
}

// ---------------------------------------------------------------------------
// Schema introspection — zod stays an optional peer, so everything below is
// duck-typed over both generations' internal shapes (best effort: nodes we
// fail to recognize are silently skipped, never guessed at, never thrown).
//
//   v3: `_def.typeName` ('ZodString'), `_def.checks` (`{kind: 'min'|'max'|
//       'length'|'regex', value|regex}`), `_def.innerType`, `_def.shape()`,
//       `_def.type` (array element), `_def.defaultValue()`
//   v4: `def.type` / `_zod.def.type` ('string'), `_zod.checks` (`{_zod:
//       {def: {check: 'greater_than'|'less_than'|'min_length'|'max_length'|
//       'length_equals'|'string_format', value|minimum|maximum|length|
//       pattern}}}`), `def.innerType`, `def.shape`, `def.element`,
//       `def.defaultValue` (getter or plain value)
// ---------------------------------------------------------------------------

/** Normalized node type: v3 'ZodString' and v4 'string' both become
 * 'string'; `''` when the shape is unrecognized. */
function zodType(node: any): string {
  const t = node?._def?.typeName || node?._zod?.def?.type || node?.def?.type;
  return typeof t !== 'string'
    ? ''
    : t.startsWith('Zod') && t.length > 3
      ? t[3].toLowerCase() + t.slice(4)
      : t;
}

/** Inner schema of wrapping nodes (optional/nullable/default/lazy): v3
 * `_def.innerType`/`_def.getter()`, v4 `def.innerType`, `.unwrap()` last. */
function unwrap(node: any): any {
  return (
    node?._def?.innerType ||
    node?._zod?.def?.innerType ||
    node?._zod?.innerType ||
    node?.def?.innerType ||
    node?._def?.getter?.() ||
    node?.schema ||
    (typeof node?.unwrap === 'function' ? node.unwrap() : undefined)
  );
}

/** Shape record of a ZodObject: `.shape` (v3/v4 getter) or v3's
 * `_def.shape()` / plain `_def.shape`. */
function shapeOf(node: any): Record<string, any> | undefined {
  if (node?.shape && typeof node.shape === 'object') return node.shape;
  const shape = node?._def?.shape;
  if (typeof shape === 'function') return shape();
  return shape && typeof shape === 'object' ? shape : undefined;
}

/** Element schema of a ZodArray: v3 `_def.type`, v4 `def.element`. */
function elementOf(node: any): any {
  return (
    node?._def?.type ||
    node?._zod?.def?.element ||
    node?.def?.element ||
    node?.element
  );
}

/** v4 check ids translated to the v3-flavoured kinds the leaf mapper
 * understands (numbers and lengths both resolve to min/max per node type —
 * zod itself guarantees which kind lands on which type). */
const CHECK_KINDS: Record<string, string> = {
  greater_than: 'min',
  less_than: 'max',
  min_length: 'min',
  max_length: 'max',
  length_equals: 'length',
  string_format: 'regex'
};

/** One normalized check `{kind, value, regex, message}`: a v3 entry
 * (`_def.checks[i]`, already `{kind, …}`) passes through; a v4 entry
 * (`_zod.checks[i]._zod.def`) is translated. Unrecognized → undefined. */
function checkOf(check: any): any {
  if (!check || typeof check !== 'object') return undefined;
  if (typeof check.kind === 'string') return check;
  const def = check._zod?.def;
  if (!def || typeof def.check !== 'string') return undefined;
  return {
    kind: CHECK_KINDS[def.check] || def.check,
    value: def.value ?? def.minimum ?? def.maximum ?? def.length,
    regex: def.pattern,
    message: typeof def.error === 'string' ? def.error : undefined
  };
}

/** The constraints one node contributes at its own path. `required: true`
 * only for non-optional nodes carrying at least one check — a bare
 * `z.string()` adds nothing, so `required` is not sprayed over the tree;
 * unmappable checks (email/int/multiple_of…) still count as "checked". */
function leafConstraints(
  node: any,
  optional: boolean,
  type: string
): SchemaConstraints | undefined {
  const raw = node?._def?.checks || node?._zod?.checks;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const constraints: SchemaConstraints = {};
  let hasCheck = false;
  for (const entry of raw) {
    const check = checkOf(entry);
    if (!check) continue;
    hasCheck = true;
    if (check.kind === 'regex') {
      const regex =
        check.regex instanceof RegExp
          ? check.regex
          : typeof check.regex === 'string'
            ? new RegExp(check.regex)
            : undefined;
      if (regex) {
        constraints.pattern = {value: regex, message: check.message || ''};
      }
    } else if (typeof check.value === 'number') {
      if (check.kind === 'min' || check.kind === 'max') {
        const kind: 'min' | 'max' = check.kind;
        constraints[
          type === 'number' ? kind : kind === 'min' ? 'minLength' : 'maxLength'
        ] = check.value;
      } else if (check.kind === 'length') {
        constraints.minLength = constraints.maxLength = check.value;
      }
    }
  }
  if (!hasCheck) return undefined;
  if (!optional) constraints.required = true;
  return constraints;
}

/**
 * Read declarative {@link FieldRules} constraints out of a zod v3/v4 object
 * schema (best effort — see the shape notes above), so form builders don't
 * re-declare rules next to the schema. Returns a record keyed by dotted
 * field path (`'user.name'`, matching `useErrors` keys): string/array
 * checks become minLength/maxLength, number checks min/max, regex checks
 * `pattern` (carrying the check's message when the schema declares one).
 * Array elements recurse onto the de-indexed path (`'items.name'`) — one
 * schema row stands for every index. Optional/nullable/default-wrapped
 * fields keep their bounds but never get `required`; bare nodes without
 * checks and unrecognized shapes are silently skipped. Pure, never throws,
 * circular references terminate.
 */
export function constraintsFromSchema(
  schema: any
): Record<string, SchemaConstraints> {
  const out: Record<string, SchemaConstraints> = {};
  collectConstraints(schema, '', false, new Set(), out);
  return out;
}

/** Depth walk for {@link constraintsFromSchema}; `seen` holds the current
 * recursion stack only (delete on exit), so shared subschema instances used
 * at several paths still walk everywhere. */
function collectConstraints(
  node: any,
  path: string,
  optional: boolean,
  seen: Set<any>,
  out: Record<string, SchemaConstraints>
): void {
  if (!node || seen.has(node)) return;
  const type = zodType(node);
  seen.add(node);
  if (
    type === 'optional' ||
    type === 'nullable' ||
    type === 'default' ||
    type === 'lazy'
  ) {
    collectConstraints(
      unwrap(node),
      path,
      optional || type !== 'lazy',
      seen,
      out
    );
  } else {
    const constraints = leafConstraints(node, optional, type);
    if (constraints && path) {
      out[path] = out[path] ? {...out[path], ...constraints} : constraints;
    }
    if (type === 'object') {
      const shape = shapeOf(node);
      if (shape) {
        for (const key in shape) {
          collectConstraints(
            shape[key],
            path ? `${path}.${key}` : key,
            optional,
            seen,
            out
          );
        }
      }
    } else if (type === 'array') {
      // The element's constraints land on the de-indexed path: the schema
      // describes one row, not the indices of a live array.
      collectConstraints(elementOf(node), path, optional, seen, out);
    }
  }
  seen.delete(node);
}

/**
 * Collect `z.default(...)` values out of a zod v3/v4 object schema (best
 * effort) as a nested values tree ready for `useForm({initialValues})` /
 * `setInitialValues`. Keys with no default anywhere below are omitted; an
 * array without its own default seeds a single row from its element's
 * defaults (`{items: [{qty: 1}]}`) — more rows are the user's to add.
 * A wrapper's own default is taken literally (v3 `defaultValue()`, v4
 * `def.defaultValue` as getter or value). Pure, never throws, circular
 * references terminate.
 */
export function defaultsFromSchema(schema: any): Record<string, any> {
  return (collectDefaults(schema, new Set()) ?? {}) as Record<string, any>;
}

/** Depth walk for {@link defaultsFromSchema}; same stack-only `seen`
 * discipline as {@link collectConstraints}. */
function collectDefaults(node: any, seen: Set<any>): any {
  if (!node || seen.has(node)) return undefined;
  const type = zodType(node);
  if (type === 'default') {
    const dv =
      node._def?.defaultValue ??
      node._zod?.def?.defaultValue ??
      node?.def?.defaultValue;
    if (dv !== undefined) return typeof dv === 'function' ? dv.call(node) : dv;
  }
  if (
    type === 'optional' ||
    type === 'nullable' ||
    type === 'default' ||
    type === 'lazy'
  ) {
    seen.add(node);
    const value = collectDefaults(unwrap(node), seen);
    seen.delete(node);
    return value;
  }
  if (type === 'object') {
    seen.add(node);
    const shape = shapeOf(node);
    const values: Record<string, any> = {};
    let empty = true;
    if (shape) {
      for (const key in shape) {
        const value = collectDefaults(shape[key], seen);
        if (value !== undefined) {
          values[key] = value;
          empty = false;
        }
      }
    }
    seen.delete(node);
    return empty ? undefined : values;
  }
  if (type === 'array') {
    seen.add(node);
    const row = collectDefaults(elementOf(node), seen);
    seen.delete(node);
    return row === undefined ? undefined : [row];
  }
  return undefined;
}
