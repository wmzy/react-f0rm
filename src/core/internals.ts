import {emit} from '../emitter';
import {get} from '../util';
import type {Name, Path, PathSegments} from '../path';
import type {FieldError, Form} from '../form';

type Cache<V> = {version: number; result: V};

export function getOrCreate<V>(
  map: WeakMap<Form, V>,
  form: Form,
  create: () => V
): V {
  if (map.has(form)) return map.get(form) as V;
  const value = create();
  map.set(form, value);
  return value;
}

/** Per-form memoization of {@link getValues}, the same version-bump/read
 * pattern {@link dirtyFieldsCaches} gives {@link getDirtyFields}. */
type ValuesCache = Cache<any>;

export const valuesCaches: WeakMap<Form, ValuesCache> = new WeakMap();

/** Increment a memo cache's `version` — the write half of the
 * version-bump/read pattern that marks its result stale. */
function bumpVersion<V extends {version: number}>(
  map: WeakMap<Form, V>,
  form: Form
): void {
  const cache = map.get(form);
  if (cache) cache.version++;
}

/** Invalidate `form`'s cached {@link getValues} result — called at every
 * point that can change values/parsedValues/initialValues, so repeated
 * reads hand back a stable reference until the next write. */
export function bumpValuesVersion(form: Form): void {
  bumpVersion(valuesCaches, form);
}

/** Per-form memoization of {@link getErrorsRecord} / {@link getErrorsTree},
 * the same version-bump/read pattern {@link valuesCaches} gives {@link
 * getValues}: every errors-Map mutation bumps the counter, reads reset it,
 * so consecutive reads hand back one stable reference until the next write. */
type ErrorsCache = Cache<Record<string, FieldError[]>> & {tree: any};

export const errorsCaches: WeakMap<Form, ErrorsCache> = new WeakMap();

/** Invalidate `form`'s cached {@link getErrorsRecord} result — called at
 * every point that mutates the errors Map. A no-op until the first read
 * installed a cache entry. */
export function bumpErrorsVersion(form: Form): void {
  bumpVersion(errorsCaches, form);
}

/** Per-path dirty-comparison baselines installed by writes with
 * `shouldDirty: false`: the written value becomes that field's baseline —
 * the write reads as a commit, not an edit. Module-private so the Form
 * shape is untouched for forms that never opt in. */
const dirtyBaselines = new WeakMap<Form, Map<string, any>>();

/** The value a field's dirtiness is measured against: its committed
 * baseline when one exists, initialValues at the path otherwise. */
export function getDirtyBaseline(
  form: Form,
  key: string,
  segments: PathSegments
): any {
  const baselines = dirtyBaselines.get(form);
  if (baselines?.has(key)) return baselines.get(key);
  return get(form.initialValues, segments);
}

/** Install a committed baseline for a `shouldDirty: false` write: the
 * field reads clean until a later write diverges. */
export function setDirtyBaseline(form: Form, {key}: Path, value: any): void {
  getOrCreate(dirtyBaselines, form, () => new Map()).set(key, value);
}

/** A wholesale write replaces the subtree below it, so baselines committed
 * under the branch die with the data they were committed against (array
 * movers rewrite the parent path, re-aligning row indices). */
export function pruneDirtyBaselines(form: Form, {key}: Path): void {
  const baselines = dirtyBaselines.get(form);
  if (!baselines?.size) return;
  const stem = `${key.slice(0, -1)},`;
  for (const baselineKey of baselines.keys()) {
    if (baselineKey.startsWith(stem)) baselines.delete(baselineKey);
  }
}

/** Drop committed baselines at one path or all of them — the state they
 * were measured against is gone. */
export function clearDirtyBaselines(form: Form, key?: string): void {
  const baselines = dirtyBaselines.get(form);
  if (!baselines) return;
  if (key === undefined) baselines.clear();
  else baselines.delete(key);
}

/** Per-form memoization of {@link getDirtyFields}. `version` counts value
 * mutations since the cached `result` was computed; bump points increment
 * it, reads reset it, so a non-zero version means the cache is stale. */
type DirtyFieldsCache = Cache<Record<string, boolean>>;

export const dirtyFieldsCaches: WeakMap<Form, DirtyFieldsCache> = new WeakMap();

/** Invalidate `form`'s cached {@link getDirtyFields} result — called at
 * every point that can change values or initialValues, so repeated reads
 * hand out a stable reference and useWatch's Object.is check can skip
 * re-renders. */
export function bumpDirtyVersion(form: Form): void {
  bumpVersion(dirtyFieldsCaches, form);
}
/** Numbers only occur inside a segments path (`['a', 0]`), never as
 * standalone names, so a top-level number marks `name` as one path rather
 * than a list of names. */
export function isSegmentsPath(
  name: PathSegments | Name[]
): name is PathSegments {
  return (name as (number | unknown)[]).some(part => typeof part === 'number');
}

export function isFieldError(value: any): value is FieldError {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.type === 'string' &&
    typeof value.message === 'string'
  );
}

/** Store a schema validator's parsed output as the getValues baseline layer
 * above initialValues. Dirty state is untouched — parsing is not an edit. */
export function setParsedValues(form: Form, values: any): void {
  if (values === undefined || values === form.parsedValues) return;
  form.parsedValues = values;
  // parsedValues is a getValues layer above initialValues, so a new parse
  // invalidates the cached merge (no bumpDirtyVersion — parsing isn't an
  // edit).
  bumpValuesVersion(form);
  emit(form.emitter, 'change');
}
