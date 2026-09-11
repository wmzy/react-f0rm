import {emit} from '../emitter';
import createPath, {segmentsFromKey} from '../path';
import type {Name, Path, PathSegments} from '../path';
import type {FieldPath, OpaqueTypes} from '../types';
import type {FieldError, FieldErrorEntry, Form} from '../form';
import {
  bumpErrorsVersion,
  errorsCaches,
  isFieldError,
  isSegmentsPath
} from './internals';

/** Reserved top-level path segment for form-level errors: the Standard
 * Schema adapter lands path-less issues under this key, read via
 * getError(form, FORM_ERROR) / getFieldErrors(form, FORM_ERROR). */
export const FORM_ERROR = '_form';

/** Brand marking a form-level validate result as a structured
 * {@link ValidationOutcome} rather than a plain nested error record.
 * Symbols can't collide with user records, so detection is
 * `VALIDATION_OUTCOME in result`. */
export const VALIDATION_OUTCOME: unique symbol = Symbol('validation-outcome');

/** Get a field's first error, or undefined. */
export function getError<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P): FieldError | undefined {
  return getErrorByPath(form, createPath(name));
}

/** Get a field's first error by path, or undefined. */
export function getErrorByPath(
  {errors}: Form,
  path: Path
): FieldError | undefined {
  return errors.get(path.key)?.[0];
}

/** Shared empty result for {@link getFieldErrorsByPath}: avoids allocating
 * on the hot no-error path. Stored arrays are handed out by reference too,
 * so treat results as read-only. */
const NO_ERRORS: FieldError[] = [];

/** Get all errors of a field (insertion order; empty array when none). */
export function getFieldErrors<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P): FieldError[] {
  return getFieldErrorsByPath(form, createPath(name));
}

/** Get all errors of a field by path (insertion order; empty when none). */
export function getFieldErrorsByPath({errors}: Form, path: Path): FieldError[] {
  return errors.get(path.key) ?? NO_ERRORS;
}

/** Get all errors as {path, type, message} entries in insertion order;
 * `path` is the dotted field path ('a.b', 'list.0'), one entry per error. */
export function getErrors({errors}: Form): FieldErrorEntry[] {
  const entries: FieldErrorEntry[] = [];
  for (const [key, list] of errors) {
    const path = segmentsFromKey(key).join('.');
    for (const {type, message} of list) entries.push({path, type, message});
  }
  return entries;
}

/** A {@link FieldPath} string converted to the dotted key error records use
 * at runtime ('items[0].name' → 'items.0.name'); quoted segments drop
 * their quotes. Public so consumers can name the key style in their types. */
export type DottedPath<P extends string> =
  P extends `${infer H}[${infer N}]${infer R}`
    ? `${H extends '' ? '' : `${H}.`}${N extends `"${infer K}"` | `'${infer K}'` ? K : N}${DottedPath<R>}`
    : P;

/** Every error as one record keyed by dotted path — react-hook-form's
 * `FieldErrors<T>` shape — plus the {@link FORM_ERROR} slot. Values are
 * the stored FieldError[] arrays shared with the form (read-only). */
export type FieldErrors<T extends Record<string, any> = any> = Partial<
  Record<DottedPath<Extract<FieldPath<T>, string>>, FieldError[]>
> & {
  [FORM_ERROR]?: FieldError[];
};

/** `true` only for the `any` type (the same probe {@link FieldPath}
 * uses), so the tree of an untyped form degrades to `any` instead of an
 * infinite mapped-type expansion. */
type IsAnyTree<T> = 0 extends 1 & T ? true : false;

type TreePrimitive =
  null | undefined | string | number | boolean | symbol | bigint;

/** One level of the nested error tree: arrays become arrays of the item's
 * tree, objects recurse per key, everything else is a leaf holding the
 * stored FieldError[] (shared with the form — read-only). */
type FieldErrorsTreeNode<T> =
  IsAnyTree<T> extends true
    ? any
    : T extends OpaqueTypes[keyof OpaqueTypes]
      ? FieldError[]
      : T extends
            | TreePrimitive
            | Function
            | Date
            | File
            | FileList
            | Map<any, any>
            | Set<any>
        ? FieldError[]
        : T extends ReadonlyArray<infer E>
          ? FieldErrorsTreeNode<E>[]
          : {[K in keyof T]?: FieldErrorsTreeNode<T[K]>};

/** Every error as one nested object following the values tree — the typed
 * optional-chain counterpart of {@link FieldErrors}' flat dotted keys.
 * Leaves hold the stored FieldError[] arrays (read-only); {@link
 * FORM_ERROR} sits at the top level. A row-level error at `items[0]` and a
 * field error at `items[0].name` cannot both occupy the `items[0]` slot:
 * whichever landed later owns it (insertion order). The flat record never
 * conflicts — read it when both coexist. */
export type FieldErrorsTree<T = any> = FieldErrorsTreeNode<T> & {
  [FORM_ERROR]?: FieldError[];
};

/** Shared rebuild for {@link getErrorsRecord} / {@link getErrorsTree}:
 * one pass over the errors Map computes both views (the dotted record
 * and the nested tree), each sharing the stored FieldError[] references.
 * The version-bump/read pattern (see {@link errorsCaches}) guarantees
 * consecutive reads hand back stable references until the next error
 * write. */
function computeErrorsViews(form: Form): void {
  const cached = errorsCaches.get(form);
  if (cached && cached.version === 0) return;
  const result: Record<string, FieldError[]> = {};
  const tree: any = {};
  for (const [key, list] of form.errors) {
    // The raw key preserves the parser's number-vs-string segment
    // distinction: 'items[0]' carries the number 0 (array index in the
    // tree), 'items["0"]' the string '0' (object key).
    const segments = segmentsFromKey(key);
    result[segments.join('.')] = list;
    let node = tree;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const slot = node[segment];
      // A shallower error inserted earlier yields to the deeper path —
      // insertion order owns the conflict, mirroring RHF's nested set.
      const container =
        slot &&
        !(Array.isArray(slot) && slot.length > 0 && isFieldError(slot[0]))
          ? slot
          : typeof segments[i + 1] === 'number'
            ? []
            : {};
      node[segment] = container;
      node = container;
    }
    node[segments[segments.length - 1]] = list;
  }
  if (cached) {
    cached.result = result;
    cached.tree = tree;
    cached.version = 0;
  } else {
    errorsCaches.set(form, {version: 0, result, tree});
  }
}

/** Get every error as one record keyed by dotted path ('a.b', 'list.0') —
 * react-hook-form's `formState.errors` shape. Values are the stored
 * FieldError[] arrays (read-only). Memoized per form with the same
 * version-bump/read pattern {@link getValues} uses, so consecutive reads
 * hand back one stable reference until an error actually changes. */
export function getErrorsRecord<T extends Record<string, any> = any>(
  form: Form<T>
): FieldErrors<T> {
  computeErrorsViews(form);
  return errorsCaches.get(form)!.result;
}

/** Get every error as one nested object following the values tree
 * (`errors.items[0].name`), the optional-chaining counterpart of
 * {@link getErrorsRecord}. Leaves hold the stored FieldError[] arrays
 * (read-only); memoized via the same version-bump/read pattern. */
export function getErrorsTree<T extends Record<string, any> = any>(
  form: Form<T>
): FieldErrorsTree<T> {
  computeErrorsViews(form);
  return errorsCaches.get(form)!.tree;
}

/** Convert a field path (bracket spelling, the `name` every API takes)
 * into the dotted key error records use: `'items[0].name'` →
 * `'items.0.name'`. */
export function fieldPathToDottedKey(name: Name): string {
  return createPath(name).value.join('.');
}

/** Convert a dotted errors-record key back into bracket path spelling
 * (`'items.0.name'` → `'items[0].name'`). Inherently lossy: the dotted key
 * cannot distinguish a segment containing a literal dot, so for such paths
 * keep the bracket spelling and read the record via
 * {@link fieldPathToDottedKey}. */
export function dottedKeyToFieldPath(key: string): string {
  const segments = key.split('.');
  const numeric = (segment: string) => /^(0|[1-9]\d*)$/.test(segment);
  return segments
    .map((segment, i) =>
      i > 0 && numeric(segment)
        ? `[${segment}]`
        : `${i > 0 ? '.' : ''}${segment}`
    )
    .join('');
}

/** Get the first error's message, or undefined when there are no errors. */
export function getFirstError({errors}: Form): string | undefined {
  return errors.values().next().value?.[0]?.message;
}

/** Options accepted by {@link setError}. */
export type SetErrorOptions = {
  /** Focus the field's element after the error lands (react-hook-form's
   * `setError` `shouldFocus`); unmounted fields are silent no-ops. */
  shouldFocus?: boolean;
};

/** Set a field's error. A string is normalized to {type: 'custom',
 * message}; a FieldError is stored as-is; an array holds several (falsy
 * items dropped); undefined clears. */
export function setError<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(
  form: Form<T>,
  name: P,
  error: string | FieldError | (string | FieldError)[] | undefined,
  options?: SetErrorOptions
): void {
  setErrorByPath(form, createPath(name), error, options);
}

/** Set a field's error by path. See {@link setError} for the input shapes. */
export function setErrorByPath(
  form: Form,
  path: Path,
  error: string | FieldError | (string | FieldError)[] | undefined,
  options?: SetErrorOptions
): void {
  const {emitter, errors} = form;
  const list = normalizeErrors(error);
  // An empty result clears the key: the errors Map never stores an empty
  // list, so hasErrors stays a plain size check and readers index [0]
  // unguarded.
  if (list) errors.set(path.key, list);
  else errors.delete(path.key);
  bumpErrorsVersion(form);
  // Path payload lets key-scoped subscribers skip unrelated fields;
  // payload-less listeners ignore it.
  emit(emitter, 'errors', path);
  if (options?.shouldFocus) emit(emitter, 'focusError', path.key);
}

/** Normalize a {@link setErrorByPath} input into the stored non-empty
 * FieldError[] shape, or undefined when there is nothing to store. */
function normalizeErrors(
  error: string | FieldError | (string | FieldError)[] | undefined
): FieldError[] | undefined {
  if (typeof error === 'string') {
    return error ? [{type: 'custom', message: error}] : undefined;
  }
  if (isFieldError(error)) return [error];
  if (!error) return undefined;
  // Falsy items drop out before normalization, so '' never becomes a
  // stored {type: 'custom', message: ''} placeholder.
  const list: FieldError[] = [];
  error.forEach(item => {
    if (typeof item === 'string' && item) {
      list.push({type: 'custom', message: item});
    } else if (isFieldError(item)) {
      list.push(item);
    }
  });
  return list.length ? list : undefined;
}

/** Clear errors: a single path, a list of paths, or (omitted) every error. */
export function clearErrors(form: Form, name?: Name | Name[]): void {
  const {emitter, errors} = form;
  if (name === undefined) {
    errors.clear();
    bumpErrorsVersion(form);
    // Payload-less broadcast: every error subscriber re-syncs.
    emit(emitter, 'errors');
    return;
  }
  // Same single-path vs list discrimination as trigger: a segment array
  // holding a number is one path ('a.0'), not a list of names.
  const paths =
    typeof name === 'string' || isSegmentsPath(name)
      ? [createPath(name)]
      : name.map(one => createPath(one));
  for (const {key} of paths) errors.delete(key);
  bumpErrorsVersion(form);
  // Path-payload emits wake exactly the affected fields' subscribers.
  for (const path of paths) emit(emitter, 'errors', path);
}

/** Options accepted by {@link setServerErrors}. */
export type SetServerErrorsOptions = {
  /** Keep existing field errors instead of clearing them first. Defaults
   * to `false`: a fresh response replaces the prior error state. */
  keepExisting?: boolean;
};

/** Land a server-side error response: each entry becomes the named field's
 * error(s) with `type: 'server'`. A string lands as one error, an array as
 * several, an empty array clears the field. By default existing errors are
 * cleared first; pass `keepExisting: true` to layer instead. */
export function setServerErrors(
  form: Form,
  errors: Record<string, string | string[]>,
  options?: SetServerErrorsOptions
): void {
  if (!options?.keepExisting) clearErrors(form);
  for (const [name, error] of Object.entries(errors)) {
    setError(
      form,
      name,
      (Array.isArray(error) ? error : [error]).map(message => ({
        type: 'server',
        message
      }))
    );
  }
}

/** Drop every `type: 'server'` error — the round-trip state a previous
 * submit landed. {@link handleSubmit} runs this before its validation
 * round so a retry is judged fresh; client errors are untouched. Emits
 * payload-less 'errors' when anything changed. */
export function clearServerErrors(form: Form): void {
  let changed = false;
  for (const [key, errors] of form.errors) {
    const kept = errors.filter(error => error.type !== 'server');
    if (kept.length === 0) {
      form.errors.delete(key);
      changed = true;
    } else if (kept.length !== errors.length) {
      form.errors.set(key, kept);
      changed = true;
    }
  }
  if (changed) {
    bumpErrorsVersion(form);
    emit(form.emitter, 'errors');
  }
}

export function hasErrors({errors}: Form): boolean {
  return errors.size > 0;
}
