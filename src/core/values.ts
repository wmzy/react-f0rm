import {emit} from '@for-fun/event-emitter';
import createPath from '../path';
import type {Name, Path, PathSegments} from '../path';
import type {FieldPath, PathValueOf} from '../types';
import {freezeValues, get, isEqual, setOwned, unset} from '../util';
import type {FieldError, Form} from '../form';
import {clearErrors, getErrorByPath, getFieldErrorsByPath} from './errors';
import {setTouchedByPath} from './touched';
import {
  bumpDirtyVersion,
  bumpValuesVersion,
  clearDirtyBaselines,
  getDirtyBaseline,
  pruneDirtyBaselines,
  setDirtyBaseline,
  valuesCaches
} from './internals';

/** Dev-only flag, replaced at build time (rollup.config.js `replace`);
 * defined for the test environment in vitest.config.ts. */
declare const __DEV__: boolean;

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
export function getValues<T extends Record<string, any> = any>(
  form: Form<T>
): T {
  let cache = valuesCaches.get(form);
  if (!cache) {
    cache = {version: 0, result: computeValues(form)};
    valuesCaches.set(form, cache);
  } else if (cache.version > 0) {
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
    merged = setOwned(merged, JSON.parse(key), value, owned);
  }
  // Unregistered fields leave a tombstone in `deleted`; remove those paths
  // from the merged result so they don't fall back to initialValues. unset
  // is immutable (set() shares untouched branches with initialValues, so a
  // mutating delete would corrupt them) and deletes the key outright rather
  // than writing undefined, which would leave `a: undefined` entries behind
  // in anything that spreads getValues().
  for (const key of deleted) {
    merged = unset(merged, JSON.parse(key));
  }
  // DEV-only: hand back a frozen snapshot (a clone — freezing the merged
  // tree in place would also freeze the initialValues/parsedValues
  // containers it borrows from). Consumer mutations then throw at the
  // offending site instead of silently corrupting the shared cache.
  return __DEV__ ? freezeValues(merged) : merged;
}

/**
 * Get field value
 * @param form
 * @param name
 */
export function getValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P): PathValueOf<T, P> {
  return getValueByPath(form, createPath(name));
}

/**
 * Get field value by path
 * @param form
 * @param path
 */
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
  // it, the same way getValues' merge layers it over the baseline, so
  // reads under it resolve from that stored value instead of falling
  // back to the pre-edit initialValues snapshot. Nearest ancestor first:
  // a finer write is layered over a coarser one (setValueByPath drops the
  // superseded descendant keys), so the closest live ancestor is the
  // newest generation. Paths the ancestor's value does not carry read
  // undefined — the baseline must not fill holes inside a replaced
  // branch.
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
 * default to `false`; omitting the options object entirely keeps the plain
 * set-value behavior (no validation, no touched marking, dirty stays
 * derived). */
export type SetFieldOptions = {
  /** Run the field's registered validator (if any) after the value lands,
   * same as triggering that single field. Defaults to `false`. */
  shouldValidate?: boolean;
  /** Mark the field as touched. Defaults to `false`. */
  shouldTouch?: boolean;
  /** Land the value as a commit instead of an edit: the value becomes the
   * field's dirty-comparison baseline, so `getDirtyFields`/`isDirty`/
   * `getFieldState().isDirty` read the field as clean, and a later write
   * dirties it only by differing from the new baseline. `true` (or
   * omitting the flag) keeps the default derived behavior — dirty while
   * the live value differs from initialValues. */
  shouldDirty?: boolean;
};

/**
 * Set field value
 * @param form
 * @param name
 * @param value
 * @param options
 */
export function setValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(
  form: Form<T>,
  name: P,
  value: PathValueOf<T, P>,
  options?: SetFieldOptions
): void {
  setValueByPath(form, createPath(name), value, options);
}

/**
 * Set field value
 * @param form
 * @param path
 * @param value
 * @param options
 */
export function setValueByPath(
  form: Form,
  path: Path,
  value: any,
  options?: SetFieldOptions
): void {
  const {emitter, values, deleted} = form;
  values.set(path.key, value);
  // The write replaces the whole subtree below it, so descendant keys in
  // the values Map belong to an older generation of that subtree: without
  // this prune they would shadow the new value on exact-key reads and
  // double-apply over it in getValues' insertion-ordered merge (a stale
  // `a.b` would survive a fresh `a` write, or corrupt an array branch
  // into an object when applied later).
  pruneDescendantKeys(values, path);
  reviveBranch(deleted, path);
  // Baselines under the replaced subtree die with it — before the emit, so
  // subscribers reading dirty state inside the emission never see a stale
  // commit suppressing the write they are being told about.
  pruneDirtyBaselines(form, path);
  if (options?.shouldDirty === false) setDirtyBaseline(form, path, value);
  bumpDirtyVersion(form);
  bumpValuesVersion(form);
  if (options?.shouldTouch) setTouchedByPath(form, path);
  if (options?.shouldValidate) form.validators.get(path.key)?.();
  emit(emitter, 'change', path);
}

/**
 * The write of {@link setValueByPath} minus the `'change'` emit: the
 * render-time {@link useField} `initialValue` seed. The field's first
 * paint (SSR included — effects never run on the server) must already
 * carry the value, so the write happens during render where emitting is
 * illegal; the seeding field announces it from its post-commit effect
 * through {@link emitChangeByPath} instead.
 *
 * Everything else matches a plain write: descendant keys of the seeded
 * path are pruned, the branch's tombstones and committed baselines are
 * revived/dropped, and both memo caches are invalidated. Like the effect
 * seed it replaces, the caller guards it to paths with no value yet.
 */
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
 * fired, split out so it can run post-commit where emitting is safe.
 * Subscribers that rendered after the seed re-read an unchanged snapshot
 * and bail; subscribers from earlier commits resync. */
export function emitChangeByPath({emitter}: Form, path: Path): void {
  emit(emitter, 'change', path);
}

/** Per-form registry of mounted fields' validation-mode overrides: path
 * key -> the field's `mode` option (undefined = follow {@link Form.mode})
 * plus an owner token so competing mounts at one path clean up safely.
 * Presence of an entry is the "a field is mounted at this path" signal
 * that routes {@link changeValueByPath} into the gated user-change
 * pipeline ({@link userChangeByPath}). Held in a WeakMap so the Form
 * shape carries only plain state fields. */
/** Snapshot of one field's aggregated state, as {@link getFieldState}
 * returns it. `errors` is the stored array shared with the form — treat it
 * as read-only, like every {@link getFieldErrors} result. */
export type FieldState<T = any> = {
  value: T;
  error: FieldError | undefined;
  errors: FieldError[];
  isDirty: boolean;
  isTouched: boolean;
  isValidating: boolean;
};

/**
 * Get one field's aggregated state: the layered value ({@link getValue}),
 * the first error ({@link getError}) and every error ({@link
 * getFieldErrors}), dirtiness, the touched flag, and whether a validator
 * is in flight. `isDirty` applies the same per-field rule as {@link
 * getDirtyFields}: a live value exists and differs from initialValues at
 * that path (parsedValues never counts — parsing is not an edit).
 *
 * @param form
 * @param name
 */
export function getFieldState<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P): FieldState<PathValueOf<T, P>> {
  const path = createPath(name);
  const {values, touched, validating} = form;
  const live = values.get(path.key);
  return {
    value: getValueByPath(form, path),
    error: getErrorByPath(form, path),
    errors: getFieldErrorsByPath(form, path),
    // Same rule as getDirtyFields, committed baselines included: the field
    // is dirty while its live value differs from its effective baseline.
    isDirty:
      values.has(path.key) &&
      getDirtyBaseline(form, path.key, path.value) !== live,
    isTouched: touched.has(path.key),
    isValidating: validating.has(path.key)
  };
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
export type RemoveFieldOptions = {
  /** Keep the field's live value and dirty baseline instead of
   * tombstoning: reads and `getValues()` keep returning the value, submit
   * includes it, and dirtiness against initialValues is preserved. */
  keepValue?: boolean;
  /** Keep the field's dirty baseline. Implies `keepValue` — a removed
   * value has nothing to be dirty about. */
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

/**
 * Remove field
 * @param form
 * @param path
 * @param options keep-flags to preserve slices of state through the removal
 */
export function removeFieldByPath(
  form: Form,
  path: Path,
  options?: RemoveFieldOptions
): void {
  const {key, value: segments} = path;
  const {emitter, values, touched, errors, validating, deleted} = form;
  if (!options?.keepValue && !options?.keepDirty) {
    values.delete(key);
    // The field is gone; a remount starts fresh rather than inheriting a
    // baseline committed by the previous incarnation.
    clearDirtyBaselines(form, key);
    // Tombstone the unregistered path so later reads do not fall back to
    // initialValues and "revive" the field's old initial value. A tombstone
    // never shadows live values: skip it when the branch is already covered
    // by a live ancestor key (e.g. a FieldArray rewrite stored the whole
    // array at the parent path) or a still-mounted descendant key.
    if (!hasLiveBranch(values, segments)) deleted.add(key);
  }
  if (!options?.keepTouched) touched.delete(key);
  if (!options?.keepError) errors.delete(key);
  validating.delete(key);
  bumpDirtyVersion(form);
  bumpValuesVersion(form);
  // Path-payload emits, scoped exactly like the writes above: every
  // mutation is bounded to this path's key (exact deletes in the four
  // stores, an exact-key tombstone), so the same matching the write sites
  // use decides who re-syncs. Leaf watchers on the path and BELOW it wake
  // (their reads fall back through the removed key), branch watchers on
  // ancestors wake (their subtree lost a leaf — the wizard/tab unmount
  // case), and global listeners (`on`, useWatch aggregates like
  // useDirtyFields/getValues readers) wake regardless — an emit with a
  // payload still reaches every plain listener. Sibling fields stay
  // asleep: unmounting one tab's fields no longer re-renders every other
  // field's subscriber.
  emit(emitter, 'change', path);
  emit(emitter, 'touched', path);
  emit(emitter, 'errors', path);
  emit(emitter, 'validating', path);
}

/**
 * Does a live value cover the branch at `segments` -- either at an ancestor
 * key or below it at a descendant key?
 */
function hasLiveBranch(
  values: Map<string, any>,
  segments: PathSegments
): boolean {
  for (let i = 1; i < segments.length; i++) {
    if (values.has(JSON.stringify(segments.slice(0, i)))) return true;
  }
  const stem = `${JSON.stringify(segments).slice(0, -1)},`;
  for (const key of values.keys()) {
    if (key.startsWith(stem)) return true;
  }
  return false;
}

/**
 * Writing a value replaces the subtree below the written path, so drop the
 * values Map keys under it: they were set against an older generation of
 * that subtree and would otherwise shadow the fresh value (exact-key reads
 * in {@link getValueByPath}) or re-apply over it (getValues' merge).
 * Deleting while iterating `keys()` is safe for a Map.
 */
function pruneDescendantKeys(values: Map<string, any>, {key}: Path): void {
  if (!values.size) return;
  const stem = `${key.slice(0, -1)},`;
  for (const k of values.keys()) {
    if (k.startsWith(stem)) values.delete(k);
  }
}

/**
 * Writing a value revives its whole branch: drop any removal tombstone for
 * the path itself, its ancestors, or its descendants (a remounted field
 * overwrites its own tombstone; rewriting a parent array supersedes the
 * tombstones of shifted child paths).
 */
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

/**
 * Set form initialValues
 *
 * Content-based early return: a new reference with equal content (the
 * re-rendered inline literal) is a no-op, so committed edits survive, while
 * genuinely changed content swaps the baseline and re-seeds — live values
 * and tombstones are cleared, touched flags and errors survive.
 * @param form
 * @param initialValues
 */
export function setInitialValues(form: Form, initialValues: any): void {
  if (
    form.initialValues === initialValues ||
    isEqual(form.initialValues, initialValues)
  ) {
    return;
  }
  form.initialValues = initialValues;
  // A new baseline invalidates the previous schema parse.
  form.parsedValues = undefined;
  form.values.clear();
  form.deleted.clear();
  // ...and every baseline committed against the old one.
  clearDirtyBaselines(form);
  bumpDirtyVersion(form);
  bumpValuesVersion(form);
  emit(form.emitter, 'change');
}

/** Options accepted by {@link reset}. Every flag defaults to `false` —
 * omitting the object (or any flag) keeps the plain full-reset behavior.
 * Names mirror react-hook-form's reset options to ease migration. */
export type ResetOptions = {
  /** Keep the current values of fields that are dirty — differ from the
   * pre-reset initialValues (the same rule {@link getDirtyFields} applies).
   * Clean fields fall back to the new initialValues as usual. */
  keepDirtyValues?: boolean;
  /** Keep every field's current live value instead of returning to the
   * baseline (react-hook-form's `keepValues` — a strict superset of
   * `keepDirtyValues`, which only preserves dirty fields' values).
   * Dirtiness is recomputed against the post-reset baseline, so kept
   * values that differ from a newly provided baseline count as dirty. */
  keepValues?: boolean;
  /** Ignore a newly provided `initialValues` argument and keep the current
   * baseline — fields still return to it (react-hook-form's
   * `keepDefaultValues`). */
  keepDefaultValues?: boolean;
  /** Keep the touched set instead of clearing it. */
  keepTouched?: boolean;
  /** Keep field errors instead of clearing them. */
  keepErrors?: boolean;
  /** Keep the submitted flag (`isSubmitSuccessful`) instead of clearing
   * it. */
  keepIsSubmitted?: boolean;
  /** Keep `submitCount` instead of resetting it to 0. */
  keepSubmitCount?: boolean;
  /** Keep `isSubmitting` instead of resetting it to false. */
  keepIsSubmitting?: boolean;
};

/** Collect every leaf path of the merged values tree into `out` —
 * structured segments (numeric for array indexes) so each leaf can be
 * written back with setValueByPath. Objects with no enumerable keys
 * (Date, File, plain empty objects) are leaves themselves. */
function collectValueLeaves(
  node: any,
  segments: PathSegments,
  out: {segments: PathSegments; value: any}[]
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

/**
 * Reset form
 * @param form
 * @param initialValues new baseline — omitted (or undefined), the form
 *        keeps its current initialValues and fields simply return to them
 *        (react-hook-form's reset-without-values semantics)
 * @param options keep-flags to preserve slices of state through the reset
 */
export function reset(
  form: Form,
  initialValues?: any,
  options?: ResetOptions
): void {
  // Snapshot the live values being preserved before the wipe: dirtiness
  // is measured against the pre-reset initialValues, so capture must
  // happen before form.values and form.initialValues are touched. The
  // snapshot carries structured segments, not dotted strings — a name
  // segment may itself contain '.' or quotes, and the dotted spelling does
  // not round-trip through the parser (dotted keys stay display-only, like
  // getDirtyFields' output). keepValues keeps every live value; the older
  // keepDirtyValues narrows the same snapshot to fields whose value
  // differs from their effective baseline.
  const keptValues: {segments: PathSegments; value: any}[] = [];
  if (options?.keepValues) {
    // Every leaf of the CURRENT merged tree — live edits and clean
    // baseline fields alike — is written back after the wipe, so a field
    // that never had a live edit keeps its pre-reset value instead of
    // adopting the new baseline's.
    collectValueLeaves(getValues(form), [], keptValues);
  } else if (options?.keepDirtyValues) {
    for (const [key, value] of form.values) {
      const segments = JSON.parse(key) as PathSegments;
      // Same predicate as getDirtyFields/forEachDirtyField: a live value
      // differing from its effective baseline (committed baselines read
      // clean and are not kept).
      if (getDirtyBaseline(form, key, segments) !== value) {
        keptValues.push({segments, value});
      }
    }
  }
  // Omitting values is a return-to-initialValues reset, not a wipe: an
  // undefined baseline would make getValues() return undefined (and every
  // consumer of it crash), so the current baseline survives when no new
  // one is provided.
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
  if (!options?.keepIsSubmitted) form.isSubmitSuccessful = undefined;
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

/** Options accepted by {@link resetField}. The flags default to `false`;
 * `value` has no default — omitted, the field falls back to initialValues;
 * provided, the explicit value becomes the live value with no fallback at
 * all. Mirrors react-hook-form's resetField options (`value` plays their
 * `defaultValue`'s role) to ease migration. */
export type ResetFieldOptions = {
  /** Keep the field's touched flag instead of clearing it. */
  keepTouched?: boolean;
  /** Keep the field's errors instead of clearing them. */
  keepErrors?: boolean;
  /** Explicit post-reset value for the field — never falls back to
   * initialValues. */
  value?: any;
};

/**
 * Reset a single field: drop its live value (reads fall back to the
 * baseline — initialValues, or the schema's parsed output when one
 * exists, in which case the path is removed from parsedValues and the
 * initial value pinned back so the field reads initialValues again),
 * clear its touched flag and errors, and revive the path's removal
 * tombstones — the inverse of {@link removeFieldByPath}. Other fields
 * and the submission flags are untouched; see {@link reset} for the
 * form-wide counterpart.
 *
 * @param form
 * @param name
 * @param options
 */
export function resetField<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, options?: ResetFieldOptions): void {
  const path = createPath(name);
  const {emitter, values, touched, errors, deleted} = form;
  values.delete(path.key);
  // The field returns to its baseline; commits from before the reset no
  // longer shadow the comparison.
  clearDirtyBaselines(form, path.key);
  // A parse baseline wholesale-shadows initialValues in reads (see
  // getValues), so unset alone would read the path as undefined. Remove
  // the path from the tree (immutable — parsedValues shares branches with
  // the schema's own output) and pin the initial value back as the live
  // value: equal to initialValues, so the field stays clean.
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
  // Payload-less by design (unlike removeFieldByPath, whose mutations are
  // key-bounded): reviveBranch can un-tombstone ancestor or descendant
  // paths, whose readers must re-sync too.
  emit(emitter, 'change');
  if (!options?.keepTouched && touched.delete(path.key)) {
    emit(emitter, 'touched', path);
  }
  if (!options?.keepErrors && errors.delete(path.key)) {
    emit(emitter, 'errors', path);
  }
  bumpDirtyVersion(form);
  bumpValuesVersion(form);
}

/**
 * @param form
 */
