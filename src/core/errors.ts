import {emit} from '../emitter';
import createPath from '../path';
import type {Name, Path, PathSegments} from '../path';
import type {FieldPath} from '../types';
import type {FieldError, FieldErrorEntry, Form} from '../form';
import {
  bumpErrorsVersion,
  errorsCaches,
  isFieldError,
  isSegmentsPath
} from './internals';

/** Reserved top-level path segment for form-level errors. The Standard
 * Schema form-level adapter lands path-less issues under this key; the
 * exported constant replaces the magic string, and readers consume it via
 * getError(form, FORM_ERROR) / getFieldErrors(form, FORM_ERROR). */
export const FORM_ERROR = '_form';

/** When a field is validated:
 * - `'onSubmit'` (default): only on submit
 * - `'onBlur'`: when the field loses focus
 * - `'onChange'`: on every change
 * - `'onTouched'`: on first blur, then on every change
 * - `'all'`: on both change and blur
 */
/** Brand marking a form-level validate result as a structured
 * {@link ValidationOutcome} (parsed values and/or errors) rather than a
 * plain nested error record. Symbols cannot collide with user error
 * records, so detection is an exact `VALIDATION_OUTCOME in result`. */
export const VALIDATION_OUTCOME: unique symbol = Symbol('validation-outcome');

/** Structured form-level validate result: `errors` uses the same nested
 * shape a plain error record uses, `values` is the schema's parsed output
 * (coerce/transform results included). Either side may be omitted. */
/**
 * Get field error
 * @param form
 * @param name
 * @return FieldError object or undefined
 */
export function getError<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P): FieldError | undefined {
  return getErrorByPath(form, createPath(name));
}

/**
 * Get field error by path
 * @param form
 * @param path
 * @return first FieldError of the field, or undefined
 */
export function getErrorByPath(
  {errors}: Form,
  path: Path
): FieldError | undefined {
  return errors.get(path.key)?.[0];
}

/** Shared empty result for {@link getFieldErrorsByPath}: a fresh `[]` per
 * call would allocate on the hot no-error path, and the stored arrays are
 * handed out by reference too, so callers must treat results as read-only. */
const NO_ERRORS: FieldError[] = [];

/**
 * Get all errors of a field
 * @param form
 * @param name
 * @return every error registered for the field (insertion order); an empty
 *         array when the field has none
 */
export function getFieldErrors<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P): FieldError[] {
  return getFieldErrorsByPath(form, createPath(name));
}

/**
 * Get all errors of a field by path
 * @param form
 * @param path
 * @return every error registered for the field (insertion order); an empty
 *         array when the field has none
 */
export function getFieldErrorsByPath({errors}: Form, path: Path): FieldError[] {
  return errors.get(path.key) ?? NO_ERRORS;
}

/**
 * Get all errors
 * @param form
 * @return array of {path, type, message} entries, in insertion order; path
 *         is the user-facing dotted field path ('a.b', 'list.0'), and a
 *         field holding several errors contributes one entry per error
 */
export function getErrors({errors}: Form): FieldErrorEntry[] {
  const entries: FieldErrorEntry[] = [];
  for (const [key, list] of errors) {
    const path = (JSON.parse(key) as PathSegments).join('.');
    for (const {type, message} of list) entries.push({path, type, message});
  }
  return entries;
}

/**
 * Convert a {@link FieldPath} string to the key form error records use at
 * runtime: paths spell array access with brackets ('items[0].name') while
 * {@link getErrorsRecord} keys are dot-joined segments ('items.0.name').
 * The declared keys follow the runtime, so typed reads
 * (`errors['items.0.name']`) match what the record actually holds. Quoted
 * segments ('items["0"]') drop their quotes like the parser does.
 */
type DottedPath<P extends string> = P extends `${infer H}[${infer N}]${infer R}`
  ? `${H extends '' ? '' : `${H}.`}${N extends `"${infer K}"` | `'${infer K}'` ? K : N}${DottedPath<R>}`
  : P;

/**
 * Every error as one record keyed by user-facing dotted path, typed
 * against the values shape — react-hook-form's `FieldErrors<T>` shape
 * (per-key values are optional there too). Keys follow the runtime form:
 * dotted paths ('a.b', 'list.0'), plus the {@link FORM_ERROR} slot for
 * form-level errors. Values are the stored FieldError[] arrays shared
 * with the form, so treat the whole result as read-only.
 */
export type FieldErrors<T extends Record<string, any> = any> = Partial<
  Record<DottedPath<Extract<FieldPath<T>, string>>, FieldError[]>
> & {
  [FORM_ERROR]?: FieldError[];
};

/**
 * Get every error as one record keyed by user-facing dotted path
 * ('a.b', 'list.0') — react-hook-form's `formState.errors` shape. Values
 * are the stored FieldError[] arrays shared with the form, so treat the
 * whole result as read-only. Memoized per form with the same
 * version-bump/read pattern {@link getValues} uses: every error write
 * bumps {@link bumpErrorsVersion}, consecutive reads hand back one stable
 * reference, so {@link useErrors} / `useFormState().errors` only re-render
 * when an error actually changed.
 *
 * @param form
 */
export function getErrorsRecord<T extends Record<string, any> = any>(
  form: Form<T>
): FieldErrors<T> {
  const cached = errorsCaches.get(form);
  if (cached && cached.version === 0) return cached.result;
  const result: Record<string, FieldError[]> = {};
  for (const [key, list] of form.errors) {
    result[(JSON.parse(key) as PathSegments).join('.')] = list;
  }
  if (cached) {
    cached.result = result;
    cached.version = 0;
  } else {
    errorsCaches.set(form, {version: 0, result});
  }
  return result;
}

/**
 * Get first error message
 * @param form
 * @return first error's message string, or undefined when there are no errors
 */
export function getFirstError({errors}: Form): string | undefined {
  return errors.values().next().value?.[0]?.message;
}

/** Snapshot of one field's aggregated state, as {@link getFieldState}
 * returns it. `errors` is the stored array shared with the form — treat it
 * as read-only, like every {@link getFieldErrors} result. */
/** Options accepted by {@link setError}. */
export type SetErrorOptions = {
  /**
   * Focus the named field's element after the error lands (react-hook-form's
   * `setError` `shouldFocus`). Rides the same 'focusError' channel
   * `setFocus` and a failed submit's auto-focus use: only mounted bound
   * fields react, unmounted ones are silent no-ops.
   */
  shouldFocus?: boolean;
};

/**
 * Set field error
 * @param form
 * @param name
 * @param error string is normalized to {type: 'custom', message}; a
 *        FieldError object is stored as-is; an array holds several errors
 *        (falsy items dropped, strings normalized); undefined clears
 * @param options {@link SetErrorOptions} — `shouldFocus` focuses the field
 *        after the error lands
 */
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

/**
 * Set field error
 * @param form
 * @param path
 * @param error string is normalized to {type: 'custom', message}; a
 *        FieldError object is stored as-is; an array holds several errors
 *        (falsy items dropped, strings normalized); undefined clears
 * @param options {@link SetErrorOptions} — `shouldFocus` focuses the field
 *        after the error lands
 */
export function setErrorByPath(
  form: Form,
  path: Path,
  error: string | FieldError | (string | FieldError)[] | undefined,
  options?: SetErrorOptions
): void {
  const {emitter, errors} = form;
  const list = normalizeErrors(error);
  // An empty result (undefined, '', or an array of only falsy items) clears
  // the key: the errors Map never stores an empty list, so hasErrors stays
  // a plain size check and readers can index [0] unguarded.
  if (list) errors.set(path.key, list);
  else errors.delete(path.key);
  bumpErrorsVersion(form);
  // Path payload lets key-scoped subscribers (onKeyEvent) skip unrelated
  // fields; payload-less listeners ignore it.
  emit(emitter, 'errors', path);
  if (options?.shouldFocus) emit(emitter, 'focusError', path.key);
}

/** Normalize any {@link setErrorByPath} input into the stored non-empty
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

/**
 * Clear errors
 * @param form
 * @param name a single path or a list of paths; omit to clear every error
 */
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
  // holding a number is one path ('a.0' shape), not a list of names.
  const paths =
    typeof name === 'string' || isSegmentsPath(name)
      ? [createPath(name)]
      : name.map(one => createPath(one));
  for (const {key} of paths) errors.delete(key);
  bumpErrorsVersion(form);
  // Path-payload emits — the setErrorByPath scoping — wake exactly the
  // affected fields' subscribers.
  for (const path of paths) emit(emitter, 'errors', path);
}

/** Options accepted by {@link setServerErrors}. */
export type SetServerErrorsOptions = {
  /** Keep existing field errors instead of clearing them first. Defaults
   * to `false`: a fresh server response replaces the prior error state. */
  keepExisting?: boolean;
};

/**
 * Land a server-side error response on the form: each entry becomes the
 * named field's error(s) with `type: 'server'`, ready for the same
 * renderError/`useError` channel client-side validation uses. Takes the
 * flat `Record<string, string | string[]>` shape REST APIs commonly
 * return (RealWorld: `422 {errors: {email: ['has already been taken']}}`)
 * without a hand-rolled `Object.entries` + `setError` loop.
 *
 * A string value lands as one error, a string array as several (first one
 * is what `getError`/`error` expose); an empty array clears that field's
 * errors. By default every existing error is cleared first — a fresh
 * response describes the current state, not a patch onto stale client
 * errors; pass `keepExisting: true` to layer instead.
 * @param form
 * @param errors field errors keyed by name
 * @param options
 */
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

/**
 * Drop every `type: 'server'` error from the form — the round-trip state
 * a previous submit landed. {@link handleSubmit} runs this before its
 * validation round so a retry is judged on the fresh attempt, not on the
 * server's verdict for the last payload (client errors are untouched:
 * they describe the current form state). Emits payload-less 'errors' when
 * anything changed.
 */
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

/**
 * Set field touched state
 * @param form
 * @param name
 */
/**
 * @param form
 */
export function hasErrors({errors}: Form): boolean {
  return errors.size > 0;
}

/** Options accepted by {@link trigger}. `shouldTouch` defaults to `false`;
 * omitting the options object entirely keeps the plain validate-only
 * behavior, so the historical two-argument calls are untouched. */
