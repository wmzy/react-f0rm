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
 * Run `teardown` synchronously on every cleanup, and let a setup that
 * immediately follows a cleanup undo it — StrictMode's dev
 * setup→cleanup→setup double-invoke would otherwise wipe state the
 * remount expects; a real unmount has no following setup, so the
 * teardown stands. `teardown`/`restore` must be referentially stable.
 */
export function useUnmountRestore(
  teardown: () => void,
  restore: () => void
): void {
  const removedRef = useRef(false);
  const teardownRef = useStage(teardown);
  const restoreRef = useStage(restore);
  useEffect(() => {
    // Copy the staged callbacks at setup so the cleanup reads stable
    // locals, not `ref.current` (which may have changed by cleanup time).
    const teardownOnce = teardownRef.current;
    const restoreOnce = restoreRef.current;
    // The previous cleanup ran the teardown — StrictMode remount: restore.
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
 * Shared field/field-array unmount: snapshot-and-remove the branch unless
 * the effective `shouldUnregister` opts out, restoring on StrictMode
 * remount.
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
