import {emit} from '../emitter';
import createPath, {segmentsFromKey} from '../path';
import type {Name, Path, PathSegments} from '../path';
import type {FieldPath, PathValueOf} from '../types';
import {freezeValues, get, isEqual, setOwned, unset} from '../util';
import type {FieldError, Form} from '../form';
import {clearErrors, getErrorByPath, getFieldErrorsByPath} from './errors';
import {isFieldDirtyByPath} from './dirty';
import {setTouchedByPath} from './touched';
import {
  bumpDirtyVersion,
  bumpErrorsVersion,
  bumpValuesVersion,
  clearDirtyBaselines,
  getDirtyBaseline,
  getOrCreate,
  pruneDirtyBaselines,
  setDirtyBaseline,
  valuesCaches
} from './internals';

/** Dev-only flag, replaced at build time (rollup.config.js `replace`);
 * defined for the test environment in vitest.config.ts. */
declare const __DEV__: boolean;

/** Get form values: the values Map layered over parsedValues (when a
 * schema validation produced them) over initialValues. Merged with
 * copy-on-write ownership tracking ({@link setOwned}), so untouched
 * branches share references with the baseline. Memoized per form via a
 * version-bump/read counter ({@link bumpValuesVersion}): consecutive reads
 * hand back the same reference; treat it as read-only. parsedValues never
 * affects dirty state — dirty compares live edits against initialValues. */
export function getValues<T extends Record<string, any> = any>(
  form: Form<T>
): T {
  const cache = getOrCreate(valuesCaches, form, () => ({
    version: 0,
    result: computeValues(form)
  }));
  if (cache.version > 0) {
    cache.result = computeValues(form);
    cache.version = 0;
  }
  return cache.result as T;
}

function computeValues(form: Form): any {
  const {initialValues, parsedValues, values, deleted} = form;
  const owned = new Set<object>();
  let merged = parsedValues ?? initialValues;
  for (const [key, value] of values) {
    merged = setOwned(merged, segmentsFromKey(key), value, owned);
  }
  // Tombstoned paths are removed so they don't fall back to initialValues.
  // unset is immutable (mutating delete would corrupt shared baseline
  // branches) and deletes outright rather than writing undefined.
  for (const key of deleted) {
    merged = unset(merged, segmentsFromKey(key));
  }
  // DEV-only: hand back a frozen clone (freezing in place would also
  // freeze the baseline containers it borrows from), so consumer mutations
  // throw at the offending site instead of corrupting the shared cache.
  return __DEV__ ? freezeValues(merged) : merged;
}

/** Get a field's value. */
export function getValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P): PathValueOf<T, P> {
  return getValueByPath(form, createPath(name));
}

/** Get a field's value by path. */
export function getValueByPath(
  {initialValues, parsedValues, values, deleted}: Form,
  path: Path
): any {
  const {key, value: segments} = path;
  if (values.has(key)) return values.get(key);
  // Unregistered path: the tombstone blocks the initialValues fallback.
  if (deleted.has(key)) return undefined;
  // A live ancestor key is a whole-branch write (setValue at a parent
  // path, every useFieldArray operation): it replaces the subtree below
  // it, so reads under it resolve from that stored value, nearest
  // ancestor first — a finer write is layered over a coarser one and
  // drops the superseded descendant keys, so the closest ancestor is the
  // newest generation. Paths the ancestor's value does not carry read
  // undefined — the baseline must not fill holes inside a replaced branch.
  for (let i = segments.length - 1; i > 0; i--) {
    const ancestorKey = JSON.stringify(segments.slice(0, i));
    if (values.has(ancestorKey)) {
      return get(values.get(ancestorKey), segments.slice(i));
    }
  }
  // Same layering as getValues: parsed values (when present) are the
  // baseline above initialValues.
  return get(parsedValues ?? initialValues, segments);
}

/** Options accepted by {@link setValue} / {@link setValueByPath} / {@link
 * changeValue} / {@link changeValueByPath}. `shouldValidate`/`shouldTouch`
 * default to `false`. */
export type SetFieldOptions = {
  /** Run the field's registered validator (if any) after the value lands.
   * Defaults to `false`. */
  shouldValidate?: boolean;
  /** Mark the field as touched. Defaults to `false`. */
  shouldTouch?: boolean;
  /** Land the value as a commit instead of an edit: it becomes the field's
   * dirty-comparison baseline. `true` (or omitting) keeps the default
   * derived behavior — dirty while the live value differs from
   * initialValues. */
  shouldDirty?: boolean;
};

/** Set a field's value. `value` may be an updater function receiving the
 * current value and returning the next (TanStack Form's `setFieldValue`
 * contract) — so a function can never itself be stored as a value. */
export function setValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(
  form: Form<T>,
  name: P,
  value: PathValueOf<T, P> | ((prev: PathValueOf<T, P>) => PathValueOf<T, P>),
  options?: SetFieldOptions
): void {
  setValueByPath(form, createPath(name), value, options);
}

/** Set a field's value by path. `value` may be an updater function (see
 * {@link setValue}). */
export function setValueByPath(
  form: Form,
  path: Path,
  value: any | ((prev: any) => any),
  options?: SetFieldOptions
): void {
  const {emitter, values, deleted} = form;
  const next =
    typeof value === 'function' ? value(getValueByPath(form, path)) : value;
  values.set(path.key, next);
  // The write replaces the whole subtree below it, so descendant keys in
  // the values Map belong to an older generation: without this prune they
  // would shadow the new value on exact-key reads and double-apply over it
  // in getValues' merge (a stale `a.b` would survive a fresh `a` write).
  pruneDescendantKeys(values, path);
  reviveBranch(deleted, path);
  // Baselines under the replaced subtree die with it — before the emit, so
  // subscribers reading dirty state in the emission never see a stale
  // commit suppressing the write they are being told about.
  pruneDirtyBaselines(form, path);
  if (options?.shouldDirty === false) setDirtyBaseline(form, path, next);
  bumpDirtyVersion(form);
  bumpValuesVersion(form);
  if (options?.shouldTouch) setTouchedByPath(form, path);
  if (options?.shouldValidate) form.validators.get(path.key)?.();
  emit(emitter, 'change', path);
}

/** The write of {@link setValueByPath} minus the `'change'` emit: the
 * render-time `useField` `initialValue` seed. The field's first paint
 * (SSR included) must already carry the value, so the write happens during
 * render where emitting is illegal; the field announces it post-commit via
 * {@link emitChangeByPath}. */
export function seedValueByPath(form: Form, path: Path, value: any): void {
  const {values, deleted} = form;
  values.set(path.key, value);
  pruneDescendantKeys(values, path);
  reviveBranch(deleted, path);
  pruneDirtyBaselines(form, path);
  bumpDirtyVersion(form);
  bumpValuesVersion(form);
}

/** Announce a {@link seedValueByPath} that happened during render: the
 * payload-carrying `'change'` emit {@link setValueByPath} would have
 * fired, split out so it runs post-commit where emitting is safe. */
export function emitChangeByPath({emitter}: Form, path: Path): void {
  emit(emitter, 'change', path);
}

/** One field's aggregated state, as {@link getFieldState} returns it.
 * `errors` is the stored array shared with the form — treat it read-only. */
export type FieldState<T = any> = {
  value: T;
  error: FieldError | undefined;
  errors: FieldError[];
  isDirty: boolean;
  isTouched: boolean;
  isValidating: boolean;
};

/** Get one field's aggregated state: layered value, first/every error,
 * dirtiness, touched flag, and validating flag. `isDirty` applies the same
 * per-field rule as {@link getDirtyFields}. */
export function getFieldState<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P): FieldState<PathValueOf<T, P>> {
  const path = createPath(name);
  const {touched, validating} = form;
  return {
    value: getValueByPath(form, path),
    error: getErrorByPath(form, path),
    errors: getFieldErrorsByPath(form, path),
    // The shared per-field rule (committed baselines included): the field
    // is dirty while its live value differs from its effective baseline.
    isDirty: isFieldDirtyByPath(form, path),
    isTouched: touched.has(path.key),
    isValidating: validating.has(path.key)
  };
}

/** Options accepted by {@link removeField}. All flags default to `false` —
 * the historical remove semantics (value dropped, path tombstoned, dirty
 * baseline/touched/errors cleared). */
export type RemoveFieldOptions = {
  /** Keep the field's live value and dirty baseline instead of
   * tombstoning: reads, `getValues()`, and submit keep the value. */
  keepValue?: boolean;
  /** Keep the field's dirty baseline. Implies `keepValue`. */
  keepDirty?: boolean;
  /** Keep the field's touched flag instead of clearing it. */
  keepTouched?: boolean;
  /** Keep the field's errors instead of clearing them. */
  keepError?: boolean;
};

export function removeField(
  form: Form,
  name: Name,
  options?: RemoveFieldOptions
): void {
  removeFieldByPath(form, createPath(name), options);
}

/** Remove a field by path; the keep-flags preserve slices of state. */
export function removeFieldByPath(
  form: Form,
  path: Path,
  options?: RemoveFieldOptions
): void {
  const {key, value: segments} = path;
  const {emitter, values, touched, errors, validating, deleted} = form;
  if (!options?.keepValue && !options?.keepDirty) {
    values.delete(key);
    // A remount starts fresh rather than inheriting a baseline committed
    // by the previous incarnation.
    clearDirtyBaselines(form, key);
    // Tombstone the unregistered path so later reads do not fall back to
    // initialValues and "revive" the old initial value. A tombstone never
    // shadows live values: skip it when a live ancestor or descendant key
    // already covers the branch.
    if (!hasLiveBranch(values, segments)) deleted.add(key);
  }
  if (!options?.keepTouched) touched.delete(key);
  if (!options?.keepError && errors.delete(key)) bumpErrorsVersion(form);
  validating.delete(key);
  bumpDirtyVersion(form);
  bumpValuesVersion(form);
  // Path-payload emits, scoped exactly like the writes above (every
  // mutation is bounded to this path's key): leaf watchers on the path and
  // below it wake, ancestor branch watchers wake, and payload-less global
  // listeners wake regardless — while sibling fields stay asleep.
  emit(emitter, 'change', path);
  emit(emitter, 'touched', path);
  emit(emitter, 'errors', path);
  emit(emitter, 'validating', path);
}

type ValuesMap = Map<string, any>;

/** Does a live value cover the branch at `segments` — at an ancestor key
 * or below it at a descendant key? */
function hasLiveBranch(values: ValuesMap, segments: PathSegments): boolean {
  for (let i = 1; i < segments.length; i++) {
    if (values.has(JSON.stringify(segments.slice(0, i)))) return true;
  }
  const stem = `${JSON.stringify(segments).slice(0, -1)},`;
  for (const key of values.keys()) {
    if (key.startsWith(stem)) return true;
  }
  return false;
}

/** Writing a value replaces the subtree below the written path, so drop
 * the values Map keys under it: they were set against an older generation
 * and would otherwise shadow the fresh value or re-apply over it. */
function pruneDescendantKeys(values: ValuesMap, {key}: Path): void {
  if (!values.size) return;
  const stem = `${key.slice(0, -1)},`;
  for (const k of values.keys()) {
    if (k.startsWith(stem)) values.delete(k);
  }
}

/** Writing a value revives its whole branch: drop any removal tombstone
 * for the path itself, its ancestors, or its descendants. */
function reviveBranch(deleted: Set<string>, {key}: Path): void {
  if (!deleted.size) return;
  for (const tombstone of deleted) {
    if (
      tombstone === key ||
      tombstone.startsWith(`${key.slice(0, -1)},`) ||
      key.startsWith(`${tombstone.slice(0, -1)},`)
    ) {
      deleted.delete(tombstone);
    }
  }
}

/** Set form initialValues. Content-based early return: a new reference with
 * equal content is a no-op (committed edits survive); genuinely changed
 * content swaps the baseline and re-seeds — live values and tombstones are
 * cleared, touched flags and errors survive. */
export function setInitialValues(form: Form, initialValues: any): void {
  if (
    form.initialValues === initialValues ||
    isEqual(form.initialValues, initialValues)
  ) {
    return;
  }
  form.initialValues = initialValues;
  // A new baseline invalidates the previous schema parse and every
  // baseline committed against the old one.
  form.parsedValues = undefined;
  form.values.clear();
  form.deleted.clear();
  clearDirtyBaselines(form);
  bumpDirtyVersion(form);
  bumpValuesVersion(form);
  emit(form.emitter, 'change');
}

/** Options accepted by {@link reset}. Every flag defaults to `false`. */
export type ResetOptions = {
  /** Keep the current values of fields that are dirty — differ from the
   * pre-reset initialValues (the same rule {@link getDirtyFields} applies). */
  keepDirtyValues?: boolean;
  /** Keep every field's current live value instead of returning to the
   * baseline (a superset of `keepDirtyValues`). Dirtiness is recomputed
   * against the post-reset baseline. */
  keepValues?: boolean;
  /** Ignore a newly provided `initialValues` and keep the current baseline. */
  keepDefaultValues?: boolean;
  /** Keep the touched set instead of clearing it. */
  keepTouched?: boolean;
  /** Keep field errors instead of clearing them. */
  keepErrors?: boolean;
  /** Keep the submitted flag (`isSubmitted`) instead of clearing it. */
  keepIsSubmitted?: boolean;
  /** Keep the last submit's success flag (`isSubmitSuccessful`). */
  keepIsSubmitSuccessful?: boolean;
  /** Keep `submitCount` instead of resetting it to 0. */
  keepSubmitCount?: boolean;
  /** Keep `isSubmitting` instead of resetting it to false. */
  keepIsSubmitting?: boolean;
};

type KeptValue = {segments: PathSegments; value: any};

/** Collect every leaf path of the merged values tree into `out` —
 * structured segments so each leaf can be written back with
 * setValueByPath. Objects with no enumerable keys are leaves themselves. */
function collectValueLeaves(
  node: any,
  segments: PathSegments,
  out: KeptValue[]
): void {
  if (node !== null && typeof node === 'object') {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        collectValueLeaves(node[i], [...segments, i], out);
      }
      return;
    }
    const keys = Object.keys(node);
    if (keys.length > 0) {
      for (const k of keys) {
        collectValueLeaves(node[k], [...segments, k], out);
      }
      return;
    }
  }
  out.push({segments, value: node});
}

/** Snapshot the values {@link reset} re-seeds after the wipe: dirtiness is
 * measured against the pre-reset initialValues, so capture must happen
 * before form.values/form.initialValues are touched. The snapshot carries
 * structured segments, not dotted strings — dotted keys don't round-trip
 * through the parser. keepValues keeps every live value; keepDirtyValues
 * narrows the snapshot to fields differing from their effective baseline. */
function collectKeptValues(form: Form, options?: ResetOptions): KeptValue[] {
  const kept: KeptValue[] = [];
  if (options?.keepValues) {
    // Every leaf of the CURRENT merged tree is written back after the
    // wipe, so a field with no live edit keeps its pre-reset value instead
    // of adopting the new baseline.
    collectValueLeaves(getValues(form), [], kept);
  } else if (options?.keepDirtyValues) {
    for (const [key, value] of form.values) {
      const segments = segmentsFromKey(key);
      // Same predicate as getDirtyFields: a live value differing from its
      // effective baseline (committed baselines read clean, not kept).
      if (getDirtyBaseline(form, key, segments) !== value) {
        kept.push({segments, value});
      }
    }
  }
  return kept;
}

/** Reset the form. Omitted (or undefined) `initialValues` keeps the current
 * baseline — fields simply return to it (react-hook-form's
 * reset-without-values semantics). */
export function reset(
  form: Form,
  initialValues?: any,
  options?: ResetOptions
): void {
  const keptValues = collectKeptValues(form, options);
  // Omitting values is a return-to-initialValues reset, not a wipe: an
  // undefined baseline would make getValues() return undefined, so the
  // current baseline survives when no new one is provided.
  form.initialValues = options?.keepDefaultValues
    ? form.initialValues
    : (initialValues ?? form.initialValues);
  // The fresh baseline drops any schema parse from the previous cycle.
  form.parsedValues = undefined;
  if (!options?.keepErrors) clearErrors(form);
  const {emitter, touched, values, deleted, validating} = form;
  values.clear();
  deleted.clear();
  clearDirtyBaselines(form);
  if (!options?.keepTouched) touched.clear();
  validating.clear();
  if (!options?.keepIsSubmitting) form.isSubmitting = false;
  if (!options?.keepSubmitCount) form.submitCount = 0;
  if (!options?.keepIsSubmitted) form.isSubmitted = false;
  if (!options?.keepIsSubmitSuccessful) form.isSubmitSuccessful = undefined;
  bumpDirtyVersion(form);
  bumpValuesVersion(form);
  // Write the kept values back over the fresh baseline: plain
  // setValueByPath, so no validation fires and nothing is marked touched.
  for (const {segments, value} of keptValues) {
    setValueByPath(form, createPath(segments), value);
  }
  emit(emitter, 'change');
  emit(emitter, 'touched');
  emit(emitter, 'validating');
  emit(emitter, 'submitting');
  emit(emitter, 'submitCount');
  emit(emitter, 'submitSuccessful');
  emit(emitter, 'reset');
}

/** Options accepted by {@link resetField}. Flags default to `false`;
 * `value` has no default — omitted, the field falls back to initialValues. */
export type ResetFieldOptions = {
  /** Keep the field's touched flag instead of clearing it. */
  keepTouched?: boolean;
  /** Keep the field's errors instead of clearing them. */
  keepErrors?: boolean;
  /** Explicit post-reset value — never falls back to initialValues. */
  value?: any;
};

/** Reset a single field: drop its live value (reads fall back to the
 * baseline), clear touched/errors, and revive the path's tombstones — the
 * inverse of {@link removeFieldByPath}. Other fields are untouched. */
export function resetField<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, options?: ResetFieldOptions): void {
  const path = createPath(name);
  const {emitter, values, touched, errors, deleted} = form;
  values.delete(path.key);
  // Commits from before the reset no longer shadow the comparison.
  clearDirtyBaselines(form, path.key);
  // A parse baseline wholesale-shadows initialValues in reads, so unset
  // alone would read undefined. Remove the path from the tree (immutable —
  // parsedValues shares branches with the schema's output) and pin the
  // initial value back as the live value so the field stays clean.
  if (form.parsedValues !== undefined) {
    form.parsedValues = unset(form.parsedValues, path.value);
    const initial = get(form.initialValues, path.value);
    if (initial !== undefined) values.set(path.key, initial);
  }
  if (options && 'value' in options) {
    values.set(path.key, options.value);
  }
  // A reset re-registers the branch, same as a write: tombstones on the
  // path or around it stop applying.
  reviveBranch(deleted, path);
  // Payload-less by design (unlike removeFieldByPath): reviveBranch can
  // un-tombstone ancestor or descendant paths, whose readers must re-sync.
  emit(emitter, 'change');
  if (!options?.keepTouched && touched.delete(path.key)) {
    emit(emitter, 'touched', path);
  }
  if (!options?.keepErrors && errors.delete(path.key)) {
    bumpErrorsVersion(form);
    emit(emitter, 'errors', path);
  }
  bumpDirtyVersion(form);
  bumpValuesVersion(form);
}
