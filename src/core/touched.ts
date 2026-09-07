import {emit} from '@for-fun/event-emitter';
import createPath from '../path';
import type {Name, Path, PathSegments} from '../path';
import type {FieldPath} from '../types';
import type {Form} from '../form';

/**
 * Set field touched state
 * @param form
 * @param name
 */
export function setTouched(form: Form, name: Name): void {
  setTouchedByPath(form, createPath(name));
}

/**
 * Set field touched state
 * @param form
 * @param path
 */
export function setTouchedByPath({emitter, touched}: Form, path: Path): void {
  if (touched.has(path.key)) return;
  touched.add(path.key);
  // Path payload lets key-scoped subscribers (onKeyEvent) skip unrelated
  // fields; payload-less listeners ignore it.
  emit(emitter, 'touched', path);
}

/**
 * Check if field has been touched
 * @param form
 * @param name
 */
export function hasTouched<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P): boolean {
  return hasTouchedByPath(form, createPath(name));
}

/**
 * Check if field has been touched
 * @param form
 * @param path
 */
export function hasTouchedByPath({touched}: Form, path: Path): boolean {
  return touched.has(path.key);
}

/**
 * Is dirty -- any value differs from initialValues
 * @param form
 */
/**
 * Get touched fields as user-facing dotted paths ('a.b', 'a.0.c'), unlike
 * the JSON array keys stored in the touched Set.
 * @param form
 * @return array of touched fields' dotted paths
 */
export function getTouchedFields({touched}: Form): string[] {
  return Array.from(touched, key =>
    (JSON.parse(key) as PathSegments).join('.')
  );
}

/**
 * Is touched -- any field has been touched
 * @param form
 */
export function isTouched({touched}: Form): boolean {
  return touched.size > 0;
}

/**
 * Remove a field: by default its live value drops out of reads and
 * `getValues()` (the path is tombstoned, so it never falls back to
 * initialValues), its dirty baseline, touched flag and errors are cleared.
 * The keep-flags preserve slices of that state instead.
 *
 * @param form
 * @param name
 */
/**
 * Options accepted by {@link removeField}. All flags default to `false` —
 * the historical remove semantics (value dropped, path tombstoned, dirty
 * baseline/touched/errors cleared). Names mirror react-hook-form's
 * `unregister` options to ease migration; RHF's `shouldValidate` and
 * `keepDefaultValue` have no counterparts (removal never validates, and
 * the tombstone is exactly the "do not revive from initialValues" choice).
 */
