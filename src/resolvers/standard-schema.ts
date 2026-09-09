/**
 * Standard Schema v1 resolver entry (`react-f0rm/resolvers/standard-schema`):
 * one adapter for any Standard Schema v1 implementation (zod v3.24+/v4,
 * valibot v1, arktype, …).
 *
 * The contract and the adapters live in `../standardSchema` — a
 * framework-free leaf shared with the core, which accepts a schema
 * directly in `createForm({validate})` / `useField({validate})`. This
 * module re-exports them under the resolver entry's public names for
 * callers that prefer the explicit adapter, plus {@link InferSchemaValues}.
 */
export type {
  StandardSchemaIssue,
  StandardSchemaV1,
  InferSchemaValues
} from '../standardSchema';
export {hasStandardProps} from '../standardSchema';
export {
  schemaToFieldValidator as standardSchemaResolver,
  schemaToFormValidator as standardSchemaFormValidator
} from '../standardSchema';
