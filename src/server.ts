/**
 * Server-side validation entry — `react-f0rm/server`.
 *
 * The core (`./form`) is pure TypeScript with zero React imports, so it
 * already runs anywhere Node does; what the server lacked is an entry
 * that never pulls React into the module graph at all — the main entry
 * re-exports the hooks/components, and a Server Action or RSC that only
 * wants to check a payload should not have to depend on them. This module
 * is that entry: values in, one whole-form validation round, structured
 * result out.
 *
 * It plays the role TanStack Form gives `createServerValidate`, minus the
 * action prop: their API wraps validation inside a generated server
 * action, while react-f0rm keeps the values store the single source of
 * truth — {@link validateValues} is a plain function over values (the
 * same contract the client-side `trigger` has over a form instance), so
 * it composes into any server framework's handler instead of owning it.
 *
 * Like the resolvers and devtools it is intentionally NOT re-exported
 * from the main entry: importing `react-f0rm/server` is the only way this
 * code reaches a bundle, so client builds that never validate on the
 * server stay at baseline size.
 */
import createForm, {getErrors, getValues, trigger} from './form';
import type {FieldErrorEntry, Options, ValidationOutcome} from './form';

// Building a branded ValidationOutcome server-side (schema adapters, or a
// hand-written validate that returns parsed values) needs the brand symbol
// itself; importing it from the package root would drag the React graph
// back in, so it is re-exported here together with its result type.
export {VALIDATION_OUTCOME} from './form';
export type {ValidationOutcome};

/** The outcome of {@link validateValues}: the error-free flag, the values
 * once the round has landed (schema-coerced where the validator produced
 * parsed values), and every error the round wrote as flat entries. */
export interface ValidateValuesResult<T extends Record<string, any> = any> {
  /** Whether the round landed no errors — `trigger`'s boolean. An invalid
   * payload is a normal outcome, never a rejection: unlike
   * `ensureValidate`, server callers learn validity from data instead of
   * catching, because both branches are interesting on the server
   * (persist vs. bounce back to the client). */
  valid: boolean;
  /** The values after the round. When the validator returned a branded
   * {@link ValidationOutcome} with `values`, those parsed values are the
   * baseline `getValues` layers over the input — schema coerce/transform
   * output included — so this is the tree to persist or feed onward, not
   * necessarily the object passed in. Deep-equals the input otherwise. */
  values: T;
  /** Every error the round landed, flattened to `{path, type, message}`
   * entries — the same list {@link getErrors} hands out on the client.
   * Feed it to `setServerErrors` to land a failed round back on the
   * client form (the Server Actions bridge; see the docs' Server Actions
   * guide). */
  errors: FieldErrorEntry[];
}

/**
 * Validate a payload of values on the server — no form instance, no
 * React.
 *
 * Spins up a throwaway form from `options` (with `initialValues` forced
 * to `values`), runs one whole-form `trigger`, and reads the outcome
 * back. `trigger` never rejects and waits out async validators and any
 * `validateDebounce` window, so a single `await` drains the whole round —
 * the returned `valid`/`errors` are final, not a snapshot mid-flight.
 *
 * Validation comes from `options.validate` — the form-level validator.
 * Field validators register through mounted fields (`useField`), and
 * nothing is mounted on the server, so they cannot participate by
 * construction; pass a schema-backed form validator
 * (`standardSchemaFormValidator(schema)` from
 * `react-f0rm/resolvers/standard-schema`) or a hand-written `validate`
 * instead. `mode`/`reValidateMode` are equally inert here — there are no
 * field events to gate — and may be omitted.
 *
 * When the validator returns a branded {@link ValidationOutcome} whose
 * `values` carry the schema's output, those parsed values become the
 * form's parsedValues baseline, so `result.values` flows coercion and
 * transforms forward (`z.coerce.number()` turning `'42'` into `42`, and
 * friends). Persist that tree; on the client the same schema round runs
 * again on submit, keeping one validation source across the boundary.
 *
 * Safe to call from Node, Server Actions and RSC — the module graph is
 * this file plus the pure core, zero React.
 *
 * @param values the payload to validate; becomes the form's initialValues
 * @param options form options; `validate` is where the rules come from
 * @return the settled round: `valid`, the (possibly parsed) values, and
 * the flat error entries
 */
export async function validateValues<T extends Record<string, any> = any>(
  values: T,
  options?: Options<T>
): Promise<ValidateValuesResult<T>> {
  const form = createForm({...options, initialValues: values});
  const valid = await trigger(form);
  return {valid, values: getValues(form), errors: getErrors(form)};
}
