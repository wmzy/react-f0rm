import createPath from '../path';
import type {Path} from '../path';
import type {PathValueOf, AnyPath} from '../types';
import type {Form, FormValidateMode, ValidationMode} from '../form';
import {setValueByPath} from './values';
import type {SetFieldOptions} from './values';
import {
  revalidateFormOnChange,
  revalidateDependentsOnChange,
  runFormValidate,
  shouldKick
} from './validate';
import {hasTouchedByPath, setTouchedByPath} from './touched';
import {getFieldErrorsByPath} from './errors';
import {getOrCreate, setDirtyBaseline} from './internals';

/** Per-form registry of mounted fields' validation-mode overrides: path
 * key -> the field's `mode` option plus an owner token. Presence of an
 * entry is the "a field is mounted at this path" signal that routes
 * {@link changeValueByPath} into the gated pipeline. WeakMap so the Form
 * shape carries only plain state fields. */
const fieldModes = new WeakMap<
  Form,
  Map<string, {mode: ValidationMode | undefined; token: object}>
>();

/** Set a field's value as a user change. When a field is mounted on the
 * path it rides the gated user-change pipeline (the field's effective
 * `mode` and the form's `reValidateMode` drive validation, as in
 * {@link userChangeByPath}); with no mounted field it degrades to a plain
 * {@link setValue}. Contrast {@link setValue}, whose `shouldValidate`
 * kicks the validator unconditionally. */
export function changeValue<
  T extends Record<string, any> = any,
  P extends AnyPath<T> = AnyPath<T>
>(
  form: Form<T>,
  name: P,
  value: PathValueOf<T, P>,
  options?: SetFieldOptions
): void {
  changeValueByPath(form, createPath(name), value, options);
}

/** Set a field's value as a user change, by parsed path. */
export function changeValueByPath(
  form: Form,
  path: Path,
  value: any,
  options?: SetFieldOptions
): void {
  // The baseline must land before the mounted field's pipeline runs — its
  // write emits synchronously and subscribers read dirty state in the
  // emission, so installing after would flash dirty-then-clean.
  if (options?.shouldDirty === false) setDirtyBaseline(form, path, value);
  if (fieldModes.get(form)?.get(path.key)) {
    // Mounted field: the field's own mode drives validation, so
    // `shouldValidate`/`shouldTouch` have no meaning here.
    userChangeByPath(form, path, value);
  } else {
    setValueByPath(form, path, value, options);
  }
}

/** Register a mounted field's `mode` override at `path` for user-change
 * gating. Returns the registration token for {@link unregisterFieldMode}
 * plus whether the slot was already occupied — two fields at one path is
 * almost always a bug (the latest mount's mode governs). */
export function registerFieldMode(
  form: Form,
  path: Path,
  mode: ValidationMode | undefined
): {token: object; displaced: boolean} {
  const modes = getOrCreate(fieldModes, form, () => new Map());
  const displaced = modes.has(path.key);
  const token = {};
  modes.set(path.key, {mode, token});
  return {token, displaced};
}

/** Drop a {@link registerFieldMode} registration; only the entry owned by
 * `token` is removed, so a later mount keeps its slot. */
export function unregisterFieldMode(
  form: Form,
  path: Path,
  token: object
): void {
  const modes = fieldModes.get(form);
  const entry = modes?.get(path.key);
  if (modes && entry && entry.token === token) modes.delete(path.key);
}

/** Fire the form-level validate cadence and swallow the async rejection —
 * nothing in a change/blur handler can await the round. */
function fireFormValidate(form: Form, cadence: FormValidateMode): void {
  if (form.validateMode !== cadence || !form.validate) return;
  runFormValidate(form).catch(() => {});
}

/** Kick the path's field validator under the mode/reValidateMode gate.
 * The live (stored) error view arms the reValidate kick — an error
 * behind a delayError window still counts. */
function kickFieldValidator(
  form: Form,
  path: Path,
  mode: ValidationMode,
  cadence: 'onChange' | 'onBlur',
  touched: boolean
): void {
  if (
    shouldKick(
      mode,
      cadence,
      touched,
      () => getFieldErrorsByPath(form, path).length > 0,
      form.reValidateMode
    )
  )
    form.validators.get(path.key)?.();
}

/** The user-change validation gate shared by a mounted field's onChange
 * and {@link changeValueByPath}: kick the field's validator, the
 * form-level `validateDeps` re-run and field-level dependents under the
 * mode/reValidateMode matrix. */
function runUserChangeGate(form: Form, path: Path, mode: ValidationMode): void {
  kickFieldValidator(
    form,
    path,
    mode,
    'onChange',
    hasTouchedByPath(form, path)
  );
  // Form-level validate deps: a user change to a listed field re-runs the
  // form-level validate under the same gate. No-op without validateDeps.
  revalidateFormOnChange(form, path, mode);
  // Form-level validate cadence (Options.validateMode): 'onChange' re-runs
  // the form-level validate on every user change — no dep list required.
  fireFormValidate(form, 'onChange');
  // Field-level validate deps: fields that declared this path re-run their
  // own validators. No-op when nobody declared it.
  revalidateDependentsOnChange(form, path, mode);
}

/** Write a bound field's user change by path: the write plus the
 * mode/reValidateMode-gated validation pipeline. Reads the effective mode
 * from the field-mode registry, so a plain write happens when no field is
 * registered at `path`. Framework adapters forward their change events
 * here. */
export function userChangeByPath(form: Form, path: Path, value: any): void {
  setValueByPath(form, path, value);
  const entry = fieldModes.get(form)?.get(path.key);
  if (entry) runUserChangeGate(form, path, entry.mode ?? form.mode);
}

/** A bound field's blur: mark the path touched (unconditional), then kick
 * its validator under the blur-side gate. Framework adapters forward blur
 * events here. */
export function userBlur(form: Form, path: Path): void {
  setTouchedByPath(form, path);
  const entry = fieldModes.get(form)?.get(path.key);
  if (!entry) return;
  kickFieldValidator(form, path, entry.mode ?? form.mode, 'onBlur', true);
  // Form-level validate cadence (Options.validateMode): 'onBlur' re-runs
  // the form-level validate on every user blur.
  fireFormValidate(form, 'onBlur');
}
