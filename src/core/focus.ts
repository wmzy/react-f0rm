import {emit} from '../emitter';
import createPath from '../path';
import type {Name} from '../path';
import type {Form} from '../form';

/** Options accepted by {@link setFocus}. All flags default to `false`. */
export type SetFocusOptions = {
  /** Select the field's text after focusing it. */
  shouldSelect?: boolean;
};

/** Programmatically focus a bound field's element. Rides the same
 * 'focusError' event channel a failed handleSubmit uses; being
 * event-driven, it is a silent no-op when the field is unmounted or
 * nothing subscribes. */
export function setFocus(
  form: Form,
  name: Name,
  options?: SetFocusOptions
): void {
  const {key} = createPath(name);
  // Omit the options argument when absent so the payload matches the shape
  // handleSubmit emits after a failed submit.
  if (options) emit(form.emitter, 'focusError', key, options);
  else emit(form.emitter, 'focusError', key);
}
