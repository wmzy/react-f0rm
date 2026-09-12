/** Standard Schema v1 (standardschema.dev) contract and adapters, shared
 * by the resolver entry and direct-schema support. The types are a
 * structural copy of the spec — no dependency on any schema library, so
 * zod/valibot/arktype and every v1 implementer work without importing
 * them. */
import {FORM_ERROR, VALIDATION_OUTCOME} from './core/errors';
import type {FieldError, ValidationOutcome, Validator} from './form';

/** A single Standard Schema issue. */
export type StandardSchemaIssue = {
  readonly message: string;
  readonly path?:
    ReadonlyArray<PropertyKey | {readonly key: PropertyKey}> | undefined;
};

/** The union Standard Schema's `validate` resolves to. */
export type StandardSchemaResult<Output = unknown> =
  | {readonly value: Output; readonly issues?: undefined}
  | {readonly issues: ReadonlyArray<StandardSchemaIssue>};

/** Structural Standard Schema v1. `types` (optional in the spec) is what
 * {@link InferSchemaValues} and `createForm`'s inference read. */
export type StandardSchemaV1<Input = unknown, Output = Input> = {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: Input
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    readonly types?: {
      readonly input: Input;
      readonly output: Output;
    };
  };
};

/** The values type a Standard Schema produces: the `Output` of its
 * `~standard.types` (coercions/transforms included). `never` when the
 * schema lacks `types` — pass an explicit `TValues`. */
export type InferSchemaValues<S> = S extends {
  readonly '~standard': {readonly types: {readonly output: infer Out}};
}
  ? Out
  : never;

/** Implements Standard Schema v1 props? A boolean predicate, not a type
 * guard — narrowing the union through a guard fails either way, so call
 * sites cast after the check. */
export function hasStandardProps(schema: any): boolean {
  return (
    !!schema &&
    typeof schema === 'object' &&
    typeof schema['~standard']?.validate === 'function'
  );
}

/** Issue → stored error entry. */
function toFieldError(issue: StandardSchemaIssue | undefined): FieldError {
  return {type: 'standard', message: issue?.message || 'Validation failed'};
}

/** Field-level adapter: validate one value with a schema and map every
 * issue to a FieldError (all issues surface; readers see the first). The
 * parsed output is validation-only — field validators never rewrite. */
export function schemaToFieldValidator(
  schema: StandardSchemaV1<any, any>
): Validator {
  return async (value: any) => {
    const result = await schema['~standard'].validate(value);
    if (!result.issues?.length) return undefined;
    return result.issues.map(toFieldError);
  };
}

/** Form-level adapter: validate the whole values object and return a
 * ValidationOutcome. Failure nests errors ({a: {b: FieldError[]}});
 * pathless issues land on FORM_ERROR. Success exposes the schema's parsed
 * output as the parsedValues baseline. `createForm({validate: schema})`
 * wraps through this automatically. */
export function schemaToFormValidator<T extends Record<string, any>>(
  schema: StandardSchemaV1<any, T>
): (values: T) => Promise<ValidationOutcome<T>> {
  return async (values: T) => {
    const result = await schema['~standard'].validate(values);
    const {issues} = result;
    if (!issues?.length) {
      // `in` keeps the union narrowed: the success variant carries `value`.
      return {
        [VALIDATION_OUTCOME]: true,
        values: 'value' in result ? result.value : undefined
      };
    }
    const errors: Record<string, any> = {};
    for (const issue of issues) {
      const segments = toPathSegments(issue);
      if (segments.length) {
        assignAtPath(errors, segments, toFieldError(issue));
      } else {
        // Pathless issues accumulate on FORM_ERROR instead of shadowing each other.
        const slot = (errors[FORM_ERROR] ??= []);
        if (Array.isArray(slot)) slot.push(toFieldError(issue));
      }
    }
    return {[VALIDATION_OUTCOME]: true, errors: pruneEmpty(errors) || {}};
  };
}

/** Stringify an issue path: PropertyKey or {key} segments → strings. */
function toPathSegments(issue: StandardSchemaIssue): string[] {
  return (issue.path || []).map(segment =>
    String(
      typeof segment === 'object' && segment !== null
        ? (segment as {key: PropertyKey}).key
        : segment
    )
  );
}

/** Append an error at a nested path: leaves are FieldError[] (issues
 * accumulate in order); a path conflicting with a leaf is skipped. */
function assignAtPath(
  root: Record<string, any>,
  segments: string[],
  error: FieldError
): void {
  let node = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (node[segment] === undefined) node[segment] = {};
    const next = node[segment];
    if (!isBranch(next)) return;
    node = next;
  }
  const leaf = segments[segments.length - 1];
  const slot = node[leaf];
  if (slot === undefined) node[leaf] = [error];
  else if (Array.isArray(slot)) slot.push(error);
}

/** A branch is a plain container built while nesting; its leaves are the FieldError[] arrays. */
function isBranch(value: any): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Drop empty branch objects left behind by conflicting issue paths. */
function pruneEmpty(
  node: Record<string, any>
): Record<string, any> | undefined {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    if (isBranch(value)) {
      const pruned = pruneEmpty(value);
      if (pruned) result[key] = pruned;
    } else {
      result[key] = value;
    }
  }
  return Object.keys(result).length ? result : undefined;
}
