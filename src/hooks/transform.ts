import {useCallback} from 'react';
import {getValueByPath, userChangeByPath} from '../form';
import type {Form} from '../form';
import type {PathSegments} from '../path';
import type {FieldPath, PathValueOf} from '../types';
import {onPathEvent} from '../subscribe';
import {useWatchCore} from './form';
import usePath from './path';

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
   * (identity). The round trip should be an identity
   * (`toDisplay(fromDisplay(x)) === x`); a store value the transform
   * cannot invert (e.g. `undefined` for a not-yet-edited field) must be
   * handled by `toDisplay`, since it runs first.
   */
  fromDisplay?: (display: TDisplay) => PathValueOf<TValues, TPath>;
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
  const {toDisplay, fromDisplay} = options;

  const subscribeFactory = useCallback(
    (invalidate: () => void) =>
      onPathEvent(form.emitter, 'change', path, 'leaf', invalidate),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- usePath memoizes the Path per key, so key pins the subscription like every path-scoped hook
    [form.emitter, path.key]
  );
  const raw = useWatchCore(subscribeFactory, () => getValueByPath(form, path));
  const value = toDisplay ? toDisplay(raw) : (raw as TDisplay);

  const onChange = useCallback(
    (display: TDisplay) => {
      userChangeByPath(
        form,
        path,
        fromDisplay ? fromDisplay(display) : display
      );
    },
    [form, path, fromDisplay]
  );

  return {value, onChange};
}
