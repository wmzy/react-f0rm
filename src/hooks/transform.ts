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

/**
 * Options accepted by {@link useTransform}.
 */
export type UseTransformOptions<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments,
  TDisplay = PathValueOf<TValues, TPath>
> = {
  /**
   * Map the form's stored (raw) value to the display value the control
   * renders — the read direction. Omitted: the raw value is displayed
   * as-is (identity).
   */
  toDisplay?: (raw: PathValueOf<TValues, TPath>) => TDisplay;
  /**
   * Map a display value back to the raw value written into the form —
   * the write direction. Omitted: the display value is written as-is
   * (identity). May return a Promise: the resolved raw value commits
   * when it settles (async transforms, e.g. server-side formatting),
   * with stale resolutions dropped — only the latest write commits.
   * The round trip should be an identity
   * (`toDisplay(fromDisplay(x)) === x`); a store value the transform
   * cannot invert (e.g. `undefined` for a not-yet-edited field) must be
   * handled by `toDisplay`, since it runs first.
   */
  fromDisplay?: (
    display: TDisplay
  ) => PathValueOf<TValues, TPath> | Promise<PathValueOf<TValues, TPath>>;
  /**
   * Debounce the display→raw commit: a write inside the window supersedes
   * the pending one, and only the last write commits when the window
   * elapses — the async-transforms counterpart of the field validator's
   * `validateDebounce` (TanStack Form's `asyncDebounceMs`). `0`/omitted
   * commits immediately (an async `fromDisplay` still resolves before
   * the commit lands). The store value stays unchanged until the commit:
   * `value` keeps deriving from it, and validation fires at commit time
   * through the user-change pipeline.
   */
  asyncDebounceMs?: number;
};

/**
 * Bind a control to a field whose stored value and display value differ
 * — TanStack Form's `useTransform` counterpart, with the round trip made
 * explicit: `toDisplay` maps the store value to what the control shows,
 * `fromDisplay` maps the control's display value back to what the store
 * holds. The store always carries the raw typed value, so
 * `getValues`/submit/validation never see display representations.
 *
 * ```jsx
 * const age = useTransform(form, 'age', {
 *   toDisplay: (raw: number) => String(raw),
 *   fromDisplay: (display: string) => Number(display)
 * });
 * <input value={age.value} onChange={e => age.onChange(e.target.value)} />
 * ```
 *
 * `value` subscribes to 'change' at leaf scope exactly like a controlled
 * `useField` value — typing, programmatic `setValue` and ancestor writes
 * all re-derive it, writes elsewhere never re-render it. `onChange`
 * writes through `userChangeByPath` (the user-change channel): with a
 * field mounted at the same path the mode/reValidateMode-gated
 * validation fires exactly as if the user typed into a bound field; with
 * no mounted field it degrades to a plain value write. Touched marking
 * stays a blur concern — pair this with `useField` at the same path, or
 * call `setTouched`, when blur semantics matter.
 *
 * The transform functions are read fresh on every render (inline
 * closures work), and `value` is recomputed per render — keep display
 * values primitive (string/number) so React's equal-state bailout holds.
 *
 * @param form the form instance (explicit; the hook is headless — no
 *        context read, no provider required)
 * @param name the field's path (dotted string or segments)
 * @param options the two mapping directions; both optional (identity)
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
  // write (a newer write supersedes the pending one), and a sequence token
  // drops stale resolutions — only the latest write commits. Live refs keep
  // the latest transform/debounce visible to a stable onChange without
  // re-subscribing (the same pattern useValidate uses for its options).
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
            // in-flight commit after unmount still lands: the form is
            // caller-owned, and losing a resolved write would be worse.)
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
