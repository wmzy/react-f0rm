/** Unmount-removal helpers: the snapshot/remove pair and its restore.
 * React 19's StrictMode double-invokes effects on the initial mount, so a
 * plain cleanup that calls {@link removeFieldByPath} wipes a field the
 * very next setup expects. `useUnmountRestore` runs the teardown on every
 * cleanup and restores on the setup that follows (which exists only in the
 * StrictMode cycle), undoing the removal before anything observes the gap.
 * Internal: hooks import it directly, the facade never re-exports it. */
import {emit} from '../emitter';
import type {FieldError, Form} from '../form';
import type {Path} from '../path';
import {setErrorByPath} from './errors';
import {bumpValuesVersion} from './internals';
import {setTouchedByPath} from './touched';
import {removeFieldByPath, setValueByPath} from './values';

/** Everything {@link removeFieldByPath} destroys, captured before it runs
 * so {@link restoreRemovedField} can put it back. */
export type RemovedFieldSnapshot = {
  /** Whether the values Map held the key — restores the exact entry,
   * including an explicit `undefined` value. */
  present: boolean;
  value: any;
  touched: boolean;
  errors: FieldError[] | undefined;
};

/** Snapshot the field's state, then remove it — the teardown half of the
 * StrictMode-safe unmount removal. */
export function removeFieldForUnmount(
  form: Form,
  path: Path
): RemovedFieldSnapshot {
  const {key} = path;
  const snapshot: RemovedFieldSnapshot = {
    present: form.values.has(key),
    value: form.values.get(key),
    touched: form.touched.has(key),
    errors: form.errors.get(key)
  };
  removeFieldByPath(form, path);
  return snapshot;
}

/** Undo {@link removeFieldForUnmount} — the restore half, run only by a
 * setup that immediately follows the cleanup (the StrictMode remount).
 * Rebuilds the exact pre-removal state:
 * - a Map-backed value re-lands via {@link setValueByPath} with
 *   `shouldDirty: false` (the removal cleared committed baselines; the
 *   restored value becomes the baseline — identical dirty reads)
 * - a baseline-derived value (absent from the Map) only needs its
 *   tombstone undone — no write, so no entry materializes
 * - touched/errors re-add without re-validating
 */
export function restoreRemovedField(
  form: Form,
  path: Path,
  snapshot: RemovedFieldSnapshot
): void {
  const {key} = path;
  if (snapshot.present) {
    setValueByPath(form, path, snapshot.value, {shouldDirty: false});
  } else {
    form.deleted.delete(key);
    bumpValuesVersion(form);
    // The removal emitted with a path payload; the restore must wake the
    // same subscribers so snapshots taken in the gap re-sync.
    emit(form.emitter, 'change', path);
  }
  if (snapshot.touched) setTouchedByPath(form, path);
  if (snapshot.errors) setErrorByPath(form, path, snapshot.errors);
}
