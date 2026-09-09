/**
 * Standard Schema v1 (https://standardschema.dev) contract and adapters,
 * shared by the resolver entry (`react-f0rm/resolvers/standard-schema`)
 * and the core's direct-schema support (`createForm({validate: schema})`,
 * `useField({validate: schema})`).
 *
 * The types are a structural copy of the spec — zero runtime or type
 * dependencies on any schema library, so zod v3.24+/v4, valibot v1,
 * arktype and every other v1 implementer work without importing them.
 * This module is framework-free and imports nothing but
 * `core/errors`' VALIDATION_OUTCOME brand at runtime.
 */
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

/**
 * Structural Standard Schema v1. `types` is optional in the spec but
 * implemented by zod v3.24+/v4, valibot v1 and arktype — it is what
 * {@link InferSchemaValues} and `createForm`'s `TValues` inference read.
 */
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

/**
 * The values type a Standard Schema produces: the `Output` of its
 * `~standard.types`, resolved structurally without importing the schema
 * library. Coercions/transforms land in the output — `z.coerce.date()`
 * infers `Date`, not `string`. `never` when the schema does not expose
 * `types` (pass an explicit `TValues` then).
 *
 * @example
 * ```ts
 * const schema = z.object({email: z.string().email()});
 * type Values = InferSchemaValues<typeof schema>; // {email: string}
 * const form = useForm<InferSchemaValues<typeof schema>>();
 * ```
 */
export type InferSchemaValues<S> = S extends {
  readonly '~standard': {readonly types: {readonly output: infer Out}};
}
  ? Out
  : never;

/**
 * Does the value implement the Standard Schema v1 props? A plain boolean
 * predicate, not a type guard: narrowing a
 * `Fn | StandardSchemaV1<In, Out>` union through the guard fails either
 * way (a generics-narrowing guard is contravariance-blocked, an
 * intersection guard keeps both members) — call sites cast after the
 * check instead.
 */
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

/**
 * Field-level Standard Schema adapter: validate a single value with any
 * schema implementing '~standard' and map every issue to a FieldError, so
 * a value breaking several rules surfaces all of them (setErrorByPath
 * stores the array; error/errorObject readers still see the first).
 * The schema's parsed output is validation-only here — field validators
 * never rewrite the value; form-level schemas own coercion.
 */
export function schemaToFieldValidator(
  schema: StandardSchemaV1<any, any>
): Validator {
  return async (value: any) => {
    const result = await schema['~standard'].validate(value);
    if (!result.issues?.length) return undefined;
    return result.issues.map(toFieldError);
  };
}

/**
 * Form-level Standard Schema adapter: validate the whole values object and
 * return a ValidationOutcome. On failure `errors` carries the nested shape
 * Options.validate expects ({a: {b: FieldError[]}}; ensureValidate flattens
 * it back to per-field errors, keeping every issue of a path). Issues
 * without a path are form-level errors and land on the FORM_ERROR key.
 * On success `values` carries the schema's parsed output (coerce/transform
 * results included), which the form stores as its parsedValues baseline —
 * the layer getValues reads above initialValues.
 *
 * `createForm({validate: schema})` wraps the schema through this adapter
 * automatically (no resolver import needed), and `TValues` infers from
 * the schema's output type.
 */
export function schemaToFormValidator<T extends Record<string, any>>(
  schema: StandardSchemaV1<any, T>
): (values: T) => Promise<ValidationOutcome<T>> {
  return async (values: T) => {
    const result = await schema['~standard'].validate(values);
    const {issues} = result;
    if (!issues?.length) {
      // Success: expose the schema's parsed output. `in` keeps the union
      // narrowed (the success variant is the one carrying `value`).
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
        // Pathless issues are all form-level: they accumulate on the
        // FORM_ERROR slot instead of the first shadowing the rest. (A
        // nested path literally named like FORM_ERROR would have made the
        // slot a branch — skip then.)
        const slot = (errors[FORM_ERROR] ??= []);
        if (Array.isArray(slot)) slot.push(toFieldError(issue));
      }
    }
    return {[VALIDATION_OUTCOME]: true, errors: pruneEmpty(errors) || {}};
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
