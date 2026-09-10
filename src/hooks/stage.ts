import {useCallback, useEffect, useRef, type MutableRefObject} from 'react';
import {removeFieldForUnmount, restoreRemovedField} from '../core/unmount';
import type {RemovedFieldSnapshot} from '../core/unmount';
import type {Form} from '../form';
import type {Path} from '../path';

export default function useStage<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useStageFn<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useStage(fn);
  return useCallback(
    (...params: any[]) => ref.current(...params),
    [ref]
  ) as unknown as T;
}

/**
 * Run destructive unmount `teardown` synchronously on every cleanup —
 * real unmounts behave exactly like a plain effect cleanup — and let a
 * setup that immediately follows a cleanup (`restore`) undo it.
 *
 * React 19's StrictMode double-invokes effects on the initial mount
 * (setup → cleanup → setup), so a plain cleanup would run the teardown
 * and then remount with the state gone. The cycle's second setup finds
 * the `removed` flag and calls `restore` before any render or event can
 * observe the gap; a real unmount has no following setup and the
 * teardown simply stands.
 *
 * `teardown`/`restore` must be referentially stable (build them with
 * {@link useStageFn}); the effect intentionally runs once per mount.
 */
export function useUnmountRestore(
  teardown: () => void,
  restore: () => void
): void {
  const removedRef = useRef(false);
  // Latest-value refs: the effect runs once per mount, and the contract
  // asks for referentially stable callbacks (build them with
  // {@link useStageFn}), so the staged versions are the mount-time
  // versions in practice.
  const teardownRef = useStage(teardown);
  const restoreRef = useStage(restore);
  useEffect(() => {
    // Copy the staged callbacks at setup: the cleanup then reads stable
    // locals instead of `ref.current` (which may legitimately have
    // changed by cleanup time), and the deps hold only stable ref objects
    // so the effect still runs exactly once per mount.
    const teardownOnce = teardownRef.current;
    const restoreOnce = restoreRef.current;
    // The previous cleanup ran the teardown — this setup is the StrictMode
    // remount: put the state back.
    if (removedRef.current) {
      removedRef.current = false;
      restoreOnce();
    }
    return () => {
      removedRef.current = true;
      teardownOnce();
    };
  }, [removedRef, teardownRef, restoreRef]);
}

/**
 * The concrete {@link useUnmountRestore} use shared by field and
 * field-array unmount: snapshot-and-remove the field/branch unless the
 * effective `shouldUnregister` (own option, falling back to the
 * form-level flag) opts out, restoring it on a StrictMode remount.
 */
export function useUnmountFieldRemoval(
  form: Form,
  path: Path,
  shouldUnregister: boolean | undefined
): void {
  const removalSnapshotRef = useRef<RemovedFieldSnapshot | null>(null);
  const teardownOnUnmount = useStageFn(() => {
    if ((shouldUnregister ?? form.shouldUnregister) === false) return;
    removalSnapshotRef.current = removeFieldForUnmount(form, path);
  });
  const restoreAfterStrictMode = useStageFn(() => {
    const snapshot = removalSnapshotRef.current;
    removalSnapshotRef.current = null;
    if (snapshot) restoreRemovedField(form, path, snapshot);
  });
  useUnmountRestore(teardownOnUnmount, restoreAfterStrictMode);
}
