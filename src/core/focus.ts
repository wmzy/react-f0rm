import {emit} from '@for-fun/event-emitter';
import createPath from '../path';
import type {Name} from '../path';
import type {Form} from '../form';

/** Options accepted by {@link setFocus}. All flags default to `false`. */
export type SetFocusOptions = {
  /** Select the field's text after focusing it. Bound fields call
   * `select()` on their element; elements without one (custom `as`
   * components) just focus. */
  shouldSelect?: boolean;
};

/**
 * Programmatically focus a bound field's element (e.g. the <Field>'s
 * input).
 *
 * Rides the same 'focusError' event channel a failed handleSubmit uses to
 * focus the first errored field: the payload is the target's path key,
 * with the focus options as a second, backward-compatible argument (older
 * subscribers declared with a single `key` parameter simply ignore it).
 * Being event-driven, it is a silent no-op when the field is unmounted or
 * nothing subscribes — unknown names never throw.
 *
 * @param form form instance
 * @param name field name (dot path or segments path)
 * @param options focus options
 */
export function setFocus(
  form: Form,
  name: Name,
  options?: SetFocusOptions
): void {
  const {key} = createPath(name);
  // Omit the options argument when absent so the payload is exactly the
  // shape handleSubmit emits after a failed submit.
  if (options) emit(form.emitter, 'focusError', key, options);
  else emit(form.emitter, 'focusError', key);
}
