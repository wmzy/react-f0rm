import {emit} from '../emitter';
import {get} from '../util';
import type {Name, Path, PathSegments} from '../path';
import type {FieldError, Form} from '../form';

/** Per-form memoization of {@link getValues}, the same version-bump/read
 * pattern {@link dirtyFieldsCaches} gives {@link getDirtyFields}. */
type ValuesCache = {version: number; result: any};

export const valuesCaches: WeakMap<Form, ValuesCache> = new WeakMap();

/**
 * Invalidate `form`'s cached {@link getValues} result. Called at every
 * point that can change values, parsedValues or initialValues
 * (setValueByPath, removeFieldByPath, setInitialValues, reset, resetField,
 * setParsedValues) so repeated reads hand back a stable reference until
 * the next write.
 */
export function bumpValuesVersion(form: Form): void {
  const cache = valuesCaches.get(form);
  if (cache) cache.version++;
}

/** Per-form memoization of {@link getErrorsRecord} /
 * {@link getErrorsTree} (src/core/errors.ts), the same version-bump/read
 * pattern {@link valuesCaches} gives {@link getValues}: every errors-Map
 * mutation bumps the counter, reads reset it, so consecutive reads hand
 * back one stable record/tree reference until the next error write. */
type ErrorsCache = {
  version: number;
  result: Record<string, FieldError[]>;
  tree: any;
};

export const errorsCaches: WeakMap<Form, ErrorsCache> = new WeakMap();

/**
 * Invalidate `form`'s cached {@link getErrorsRecord} result. Called at
 * every point that mutates the errors Map — setErrorByPath, clearErrors,
 * setServerErrors/clearServerErrors, clearFormValidateErrors (the
 * form-level round's pre-land cleanup), removeFieldByPath and resetField's
 * error drops. A no-op until the first read installed a cache entry.
 */
export function bumpErrorsVersion(form: Form): void {
  const cache = errorsCaches.get(form);
  if (cache) cache.version++;
}

/**
 * Get form values: the values Map layered over parsedValues (when a schema
 * validation produced them) layered over initialValues.
 *
 * Merged with copy-on-write ownership tracking ({@link setOwned}): every
 * distinct container on a written path is allocated once and shared by all
 * paths through it, instead of re-copying the whole branch for every key.
 * One owned set spans the whole merge, so containers borrowed from the
 * parsedValues tree are copied before mutation exactly like initialValues
 * ones. The result is a freshly merged tree per mutation, with untouched
 * branches sharing references with the baseline exactly like chained
 * `set` did.
 *
 * Memoized per form like {@link getDirtyFields}: every value write bumps a
 * `version` counter ({@link bumpValuesVersion}) while reads reset it, so
 * consecutive reads hand back the same reference (submit, changeValue and
 * form-level validate all read the whole tree, often several times per
 * interaction). Treat the result as read-only — the next read after a
 * write returns a fresh tree, but between writes the cached one is shared
 * with every other reader.
 *
 * parsedValues is the schema's complete output tree: once validation
 * succeeds it replaces the initialValues baseline (fields the schema
 * dropped disappear), while live edits in the values Map still win over
 * both. It never affects dirty state — {@link isDirty} and
 * {@link getDirtyFields} compare live edits against initialValues only,
 * because parsing is not a user edit.
 *
 * @param form
 */
/** Per-path dirty-comparison baselines installed by writes with
 * `shouldDirty: false`: the written value becomes that field's baseline —
 * the write reads as a commit, not an edit. Module-private (like
 * {@link dirtyFieldsCaches}) so the Form shape is untouched for forms that
 * never opt in. */
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
 * field reads clean until a later write diverges from the new baseline. */
export function setDirtyBaseline(form: Form, {key}: Path, value: any): void {
  let baselines = dirtyBaselines.get(form);
  if (!baselines) {
    baselines = new Map();
    dirtyBaselines.set(form, baselines);
  }
  baselines.set(key, value);
}

/** A wholesale write at a path replaces the subtree below it, so baselines
 * committed under the branch die with the data they were committed against
 * (array movers rewrite the parent path, re-aligning row indices). Called
 * from every write — a no-op unless the form ever opted in. */
export function pruneDirtyBaselines(form: Form, {key}: Path): void {
  const baselines = dirtyBaselines.get(form);
  if (!baselines?.size) return;
  const stem = `${key.slice(0, -1)},`;
  for (const baselineKey of baselines.keys()) {
    if (baselineKey.startsWith(stem)) baselines.delete(baselineKey);
  }
}

/** Drop committed baselines at one path ({@link removeFieldByPath} /
 * {@link resetField}) or all of them ({@link setInitialValues} /
 * {@link reset}) — the state they were measured against is gone. */
export function clearDirtyBaselines(form: Form, key?: string): void {
  const baselines = dirtyBaselines.get(form);
  if (!baselines) return;
  if (key === undefined) baselines.clear();
  else baselines.delete(key);
}

/** Per-form memoization of {@link getDirtyFields}. `version` counts value
 * mutations since the cached `result` was computed: bump points increment
 * it, reads reset it, so a non-zero version means the cache is stale. */
type DirtyFieldsCache = {version: number; result: Record<string, boolean>};

export const dirtyFieldsCaches: WeakMap<Form, DirtyFieldsCache> = new WeakMap();

/**
 * Invalidate `form`'s cached {@link getDirtyFields} result. Called at every
 * point that can change values or initialValues (setValueByPath,
 * removeFieldByPath, setInitialValues, reset) so repeated reads hand out a
 * stable reference and useWatch's Object.is snapshot check can skip
 * re-renders.
 */
export function bumpDirtyVersion(form: Form): void {
  const cache = dirtyFieldsCaches.get(form);
  if (cache) cache.version++;
}
/** Numbers only occur inside a segments path (`['a', 0]`), never as
 * standalone names, so a top-level number marks `name` as one single path
 * rather than a list of names. */
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

/**
 * Flatten a form-level validate result and write each leaf error through
 * setError. Nested objects descend into deeper paths ({a: {b: 'msg'}} sets
 * the 'a.b' error), array values contribute every non-empty string they
 * hold as separate errors (zod flatten() formErrors style), and
 * FieldError-shaped objects are stored as-is. Falsy values are skipped.
 *
 * When `footprint` is passed (validateDeps forms only), every leaf this
 * round actually stored is recorded into it — the exact stored array —
 * so the next round can drop exactly what this one wrote.
/** Store a schema validator's parsed output as the getValues baseline
 * layer above initialValues. Payload-less 'change' notifies value
 * watchers (useValue, useDirtyFields, ...); dirty state is untouched —
 * it only compares live edits against initialValues, and parsing is not
 * an edit. */
export function setParsedValues(form: Form, values: any): void {
  if (values === undefined || values === form.parsedValues) return;
  form.parsedValues = values;
  // parsedValues is a getValues layer above initialValues, so a new parse
  // invalidates the cached merge (dirty state is untouched — parsing is
  // not an edit, hence no bumpDirtyVersion here).
  bumpValuesVersion(form);
  emit(form.emitter, 'change');
}

/**
 * Land a form-level validate result. A plain record keeps the
 * long-standing behavior — flattened into field errors by
 * {@link setFormErrors}. A branded {@link ValidationOutcome} splits
 * instead: `errors` flattens exactly like a plain record, and `values`
 * (the schema's parsed output — coerced/transformed values included)
 * becomes the form's parsedValues baseline. Falsy results are skipped,
 * branded or not.
 *
 * Forms that opted into `validateDeps` additionally get round-scoped
 * error ownership: before the new result lands, the errors the previous
 * round wrote are dropped ({@link clearFormValidateErrors}), so a re-run
 * that passes makes the cross-field error disappear — and the new
 * round's own writes become the tracked footprint. Forms without the
 * option keep the historical write-only behavior untouched.
 */
