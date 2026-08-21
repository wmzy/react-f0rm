import type {FieldError} from '../form';
import type {Validator} from '../hooks/validate';

/**
 * Minimal copy of the Standard Schema v1 interfaces
 * (https://standardschema.dev) so this module has zero runtime and type
 * dependencies on any schema library. Implemented by zod v3.24+/v4,
 * valibot v1, arktype and others.
 */
export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?:
    | ReadonlyArray<PropertyKey | {readonly key: PropertyKey}>
    | undefined;
}

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: Input
    ) =>
      | {readonly value: Output; readonly issues?: undefined}
      | {readonly issues: ReadonlyArray<StandardSchemaIssue>}
      | Promise<
          | {readonly value: Output; readonly issues?: undefined}
          | {readonly issues: ReadonlyArray<StandardSchemaIssue>}
        >;
  };
}

/**
 * Does the schema implement the Standard Schema v1 props?
 */
export function hasStandardProps(schema: any): schema is StandardSchemaV1 {
  return (
    !!schema &&
    typeof schema === 'object' &&
    typeof schema['~standard']?.validate === 'function'
  );
}

function toFieldError(issue: StandardSchemaIssue | undefined): FieldError {
  return {type: 'standard', message: issue?.message || 'Validation failed'};
}

/**
 * Field-level Standard Schema adapter: validate a single value with any
 * schema implementing '~standard' and map the first issue to a FieldError.
 *
 * @param schema a Standard Schema v1 (zod v3.24+/v4, valibot v1, arktype...)
 * @return field validator compatible with useField's validate option
 */
export function standardSchemaResolver(schema: StandardSchemaV1): Validator {
  return async (value: any) => {
    const result = await schema['~standard'].validate(value);
    if (!result.issues?.length) return undefined;
    return toFieldError(result.issues[0]);
  };
}

/**
 * Form-level Standard Schema adapter: validate the whole values object with
 * any schema implementing '~standard' and map issues into the nested error
 * shape Options.validate expects ({a: {b: FieldError}}; ensureValidate
 * flattens it back to per-field errors). Issues without a path are
 * form-level errors and land on the '_form' key.
 *
 * @param schema a Standard Schema v1 (zod v3.24+/v4, valibot v1, arktype...)
 * @return form-level validator for createForm({validate: ...})
 */
export function standardSchemaFormValidator<T extends Record<string, any>>(
  schema: StandardSchemaV1<T, any>
): (values: T) => Promise<Record<string, any>> {
  return async (values: T) => {
    const result = await schema['~standard'].validate(values);
    const {issues} = result;
    if (!issues?.length) return {};
    const errors: Record<string, any> = {};
    for (const issue of issues) {
      const segments = toPathSegments(issue);
      if (segments.length) {
        assignAtPath(errors, segments, toFieldError(issue));
      } else if (!errors._form) {
        errors._form = toFieldError(issue);
      }
    }
    return pruneEmpty(errors) || {};
  };
}

/**
 * Stringify an issue path: PropertyKey or {key} path segments → strings.
 */
function toPathSegments(issue: StandardSchemaIssue): string[] {
  const path = issue.path || [];
  const segments: string[] = [];
  for (const segment of path) {
    const key =
      typeof segment === 'object' && segment !== null
        ? (segment as {key: PropertyKey}).key
        : segment;
    segments.push(String(key));
  }
  return segments;
}

/**
 * Set the error at a nested path; the first issue at any path wins — later
 * issues conflicting with an existing leaf or crossing it are skipped.
 */
function assignAtPath(
  root: Record<string, any>,
  segments: string[],
  error: FieldError
): void {
  let node = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    let next = node[segment];
    if (next === undefined) {
      next = node[segment] = {};
    }
    if (!isBranch(next)) return;
    node = next;
  }
  const leaf = segments[segments.length - 1];
  if (node[leaf] === undefined) node[leaf] = error;
}

/**
 * A branch is a plain container built while nesting, not a FieldError leaf.
 */
function isBranch(value: any): value is Record<string, any> {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.type !== 'string' &&
    typeof value.message !== 'string'
  );
}

/**
 * Drop empty branch objects left behind by conflicting issue paths.
 */
function pruneEmpty(
  node: Record<string, any>
): Record<string, any> | undefined {
  let hasLeaf = false;
  const result: Record<string, any> = {};
  Object.entries(node).forEach(([key, value]) => {
    if (isBranch(value)) {
      const pruned = pruneEmpty(value);
      if (pruned) {
        result[key] = pruned;
        hasLeaf = true;
      }
    } else {
      result[key] = value;
      hasLeaf = true;
    }
  });
  return hasLeaf ? result : undefined;
}
