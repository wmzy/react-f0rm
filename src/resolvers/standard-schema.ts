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
 * schema implementing '~standard' and map every issue to a FieldError,
 * so a value breaking several rules surfaces all of them (setErrorByPath
 * stores the array; error/errorObject readers still see the first).
 *
 * @param schema a Standard Schema v1 (zod v3.24+/v4, valibot v1, arktype...)
 * @return field validator compatible with useField's validate option
 */
export function standardSchemaResolver(schema: StandardSchemaV1): Validator {
  return async (value: any) => {
    const result = await schema['~standard'].validate(value);
    if (!result.issues?.length) return undefined;
    return result.issues.map(toFieldError);
  };
}

/**
 * Form-level Standard Schema adapter: validate the whole values object with
 * any schema implementing '~standard' and map issues into the nested error
 * shape Options.validate expects ({a: {b: FieldError[]}}; ensureValidate
 * flattens it back to per-field errors, keeping every issue of a path).
 * Issues without a path are form-level errors and land on the '_form' key.
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
      } else {
        // Pathless issues are all form-level: they accumulate on '_form'
        // instead of the first shadowing the rest. (A nested path literally
        // named '_form' would have made the slot a branch — skip then.)
        const slot = (errors._form ??= []);
        if (Array.isArray(slot)) slot.push(toFieldError(issue));
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
 * Append the error at a nested path. Leaves are FieldError[] arrays, so
 * several issues on one field accumulate in issue order; an issue whose
 * path conflicts with an existing leaf or crosses it is skipped.
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
  const slot = node[leaf];
  if (slot === undefined) node[leaf] = [error];
  else if (Array.isArray(slot)) slot.push(error);
}

/**
 * A branch is a plain container built while nesting; the leaves it carries
 * are the FieldError[] arrays assignAtPath appends.
 */
function isBranch(value: any): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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
