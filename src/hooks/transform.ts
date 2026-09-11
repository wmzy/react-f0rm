import {useCallback, useEffect, useRef} from 'react';
import {getValueByPath, userChangeByPath} from '../form';
import type {Form} from '../form';
import type {PathSegments} from '../path';
import type {FieldPath, PathValueOf} from '../types';
import {isPromise} from '../util';
import {onPathEvent} from '../subscribe';
import {useWatchCore} from './form';
import usePath, {pathFromKey} from './path';
import useStage from './stage';

export type UseTransformOptions<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments,
  TDisplay = PathValueOf<TValues, TPath>
> = {
  /** Map the stored (raw) value to the display value (read direction);
   * omitted = identity. */
  toDisplay?: (raw: PathValueOf<TValues, TPath>) => TDisplay;
  /** Map a display value back to the raw value (write direction);
   * omitted = identity. May return a Promise — only the latest write
   * commits (stale resolutions drop). The round trip should be an
   * identity; non-invertible store values must be handled by
   * `toDisplay`, which runs first. */
  fromDisplay?: (
    display: TDisplay
  ) => PathValueOf<TValues, TPath> | Promise<PathValueOf<TValues, TPath>>;
  /** Debounce the display→raw commit; only the last write in the window
   * commits (TanStack `asyncDebounceMs`). `0`/omitted commits
   * immediately; validation fires at commit time through the
   * user-change pipeline. */
  asyncDebounceMs?: number;
};

/**
 * Bind a control whose display value differs from the stored raw value
 * (TanStack `useTransform`): `toDisplay` maps store→display,
 * `fromDisplay` maps display→store. The store always carries the raw
 * value. `value` subscribes to 'change' at leaf scope; `onChange` writes
 * through the user-change channel, so mode-gated validation fires as if
 * the user typed. Transform functions are read fresh each render.
 */
export default function useTransform<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments,
  TDisplay = PathValueOf<TValues, TPath>
>(
  form: Form<TValues>,
  name: TPath,
  options: UseTransformOptions<TValues, TPath, TDisplay> = {}
): {value: TDisplay; onChange: (display: TDisplay) => void} {
  const path = usePath(name);
  const {toDisplay, fromDisplay, asyncDebounceMs} = options;

  const subscribeFactory = useCallback(
    (invalidate: () => void) =>
      onPathEvent(
        form.emitter,
        'change',
        pathFromKey(path.key),
        'leaf',
        invalidate
      ),
    [form.emitter, path.key]
  );
  const raw = useWatchCore(subscribeFactory, () => getValueByPath(form, path));
  const value = toDisplay ? toDisplay(raw) : (raw as TDisplay);

  // Async commit machinery: `asyncDebounceMs` debounces the display→raw
  // write (a newer write supersedes the pending one), and a sequence
  // token drops stale resolutions — only the latest write commits. Live
  // refs keep the latest transform/debounce visible to a stable onChange
  // without re-subscribing (the same pattern useValidate uses).
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const fromDisplayRef = useStage(fromDisplay);
  const debounceRef = useStage(asyncDebounceMs ?? 0);
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    []
  );

  const onChange = useCallback(
    (display: TDisplay) => {
      const run = () => {
        const seq = ++seqRef.current;
        const transform = fromDisplayRef.current;
        const commit = (next: PathValueOf<TValues, TPath>) =>
          userChangeByPath(form, path, next);
        if (!transform) {
          commit(display as unknown as PathValueOf<TValues, TPath>);
          return;
        }
        const result = transform(display);
        if (isPromise(result)) {
          result.then(next => {
            // Stale resolution: a newer write took over — drop it. (An
            // in-flight commit after unmount still lands; losing a
            // resolved write would be worse.)
            if (seqRef.current === seq) commit(next);
          });
        } else if (seqRef.current === seq) {
          commit(result);
        }
      };
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (debounceRef.current > 0) {
        timerRef.current = setTimeout(run, debounceRef.current);
      } else {
        run();
      }
    },
    [form, path, fromDisplayRef, debounceRef]
  );

  return {value, onChange};
}
