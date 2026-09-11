import {segmentsFromKey} from '../path';
import type {Path} from '../path';
import type {Form} from '../form';
import {dirtyFieldsCaches, getDirtyBaseline, getOrCreate} from './internals';

/** Is one field dirty — the per-field rule behind `getFieldState`'s
 * `isDirty`: a live value exists at the path and differs from the field's
 * effective baseline (committed `shouldDirty: false` baselines included).
 * A leaf under a wholesale ancestor write reports clean — dirtiness
 * belongs to the branch that actually diverged. */
export function isFieldDirtyByPath(form: Form, path: Path): boolean {
  const live = form.values.get(path.key);
  return (
    form.values.has(path.key) &&
    getDirtyBaseline(form, path.key, path.value) !== live
  );
}

/** Is dirty — any value differs from initialValues. */
export function isDirty(form: Form): boolean {
  for (const [key, value] of form.values) {
    const path = segmentsFromKey(key);
    if (getDirtyBaseline(form, key, path) !== value) return true;
  }
  return false;
}

function forEachDirtyField(form: Form, fn: (dottedKey: string) => void): void {
  for (const [key, value] of form.values) {
    const path = segmentsFromKey(key);
    if (getDirtyBaseline(form, key, path) !== value) fn(path.join('.'));
  }
}

function computeDirtyFields(form: Form): Record<string, boolean> {
  const dirtyFields: Record<string, boolean> = {};
  forEachDirtyField(form, key => {
    dirtyFields[key] = true;
  });
  return dirtyFields;
}

/** Dirty entries only ever map to `true`, so equal key sets mean shallow
 * equal results. */
function sameDirtyKeys(
  a: Record<string, boolean>,
  b: Record<string, boolean>
): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(key => b[key] === true);
}

/** Get dirty fields — fields whose current value differs from
 * initialValues. Keys are user-facing dotted paths ('a.b', 'a.0.c'); the
 * same reference is returned until the dirty set actually changes. */
export function getDirtyFields(form: Form): Record<string, boolean> {
  const cache = getOrCreate(dirtyFieldsCaches, form, () => ({
    version: 0,
    result: computeDirtyFields(form)
  }));
  if (cache.version > 0) {
    const result = computeDirtyFields(form);
    // Keep the old reference when the dirty set is unchanged so subscribers
    // see identity-stable snapshots.
    if (!sameDirtyKeys(cache.result, result)) cache.result = result;
    cache.version = 0;
  }
  return cache.result;
}
