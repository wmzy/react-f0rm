import type {PathSegments} from '../path';
import type {Form} from '../form';
import {dirtyFieldsCaches, getDirtyBaseline} from './internals';

/**
 * Is dirty -- any value differs from initialValues
 * @param form
 */
export function isDirty(form: Form): boolean {
  let dirty = false;
  forEachDirtyField(form, () => {
    dirty = true;
  });
  return dirty;
}

function forEachDirtyField(form: Form, fn: (dottedKey: string) => void): void {
  for (const [key, value] of form.values) {
    const path = JSON.parse(key) as PathSegments;
    if (getDirtyBaseline(form, key, path) !== value) fn(path.join('.'));
  }
}

/** Per-path dirty-comparison baselines installed by writes with
 * `shouldDirty: false`: the written value becomes that field's baseline —
 * the write reads as a commit, not an edit. Module-private (like
 * {@link dirtyFieldsCaches}) so the Form shape is untouched for forms that
 * never opt in. */

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

/**
 * Get dirty fields -- fields whose current value differs from initialValues.
 * Keys are user-facing dotted paths ('a.b', 'a.0.c'), unlike the JSON array
 * keys stored in the values Map.
 * @param form
 * @return object mapping each dirty field's dotted path to true; the same
 * reference is returned until the dirty set actually changes
 */
export function getDirtyFields(form: Form): Record<string, boolean> {
  let cache = dirtyFieldsCaches.get(form);
  if (!cache) {
    cache = {version: 0, result: computeDirtyFields(form)};
    dirtyFieldsCaches.set(form, cache);
  } else if (cache.version > 0) {
    const result = computeDirtyFields(form);
    // Keep the old reference when the dirty set is unchanged (values always
    // map to true) so subscribers see identity-stable snapshots.
    if (!sameDirtyKeys(cache.result, result)) cache.result = result;
    cache.version = 0;
  }
  return cache.result;
}

/**
 * Get touched fields as user-facing dotted paths ('a.b', 'a.0.c'), unlike
 * the JSON array keys stored in the touched Set.
 * @param form
 * @return array of touched fields' dotted paths
 */
