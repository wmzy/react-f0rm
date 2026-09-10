import createPath from '../path';
import type {Path, PathSegments} from '../path';
import type {FieldPath, PathValueOf} from '../types';
import type {Form, ValidationMode} from '../form';
import {setValueByPath} from './values';
import type {SetFieldOptions} from './values';
import {
  revalidateFormOnChange,
  revalidateDependentsOnChange,
  runFormValidate
} from './validate';
import {hasTouchedByPath, setTouchedByPath} from './touched';
import {getFieldErrorsByPath} from './errors';
import {setDirtyBaseline} from './internals';

/** Per-form registry of mounted fields' validation-mode overrides: path
 * key -> the field's `mode` option (undefined = follow {@link Form.mode})
 * plus an owner token so competing mounts at one path clean up safely.
 * Presence of an entry is the "a field is mounted at this path" signal
 * that routes {@link changeValueByPath} into the gated user-change
 * pipeline ({@link userChangeByPath}). Held in a WeakMap so the Form
 * shape carries only plain state fields. */
const fieldModes = new WeakMap<
  Form,
  Map<string, {mode: ValidationMode | undefined; token: object}>
>();

/**
 * Set a field value as a user change.
 *
 * The write rides the same gated user-change pipeline a user typing into
 * the field would fire when a field is mounted on the path (registered
 * through {@link registerFieldMode} — `useField` registers on mount): the
 * field's effective `mode` (per-field override included) and the form's
 * `reValidateMode` drive validation exactly as in {@link
 * userChangeByPath}. With no mounted field on the path it degrades to a
 * plain value set ({@link setValue}).
 *
 * This is the channel for component-library bridges that hand a control a
 * plain setter bound to a field — they cannot rebuild the gating from
 * public form state, because the per-field mode override and the
 * live-error view that gates `reValidateMode` live in the field
 * registration, not in public state.
 *
 * Contrast {@link setValue}: that is the imperative channel — its
 * `shouldValidate` option kicks the field's validator unconditionally,
 * ignoring any mode. Functional updaters are the caller's to evaluate
 * ({@link getValue}).
 *
 * `options` carries the same {@link SetFieldOptions}: on the fallback path
 * (no mounted field) they forward to {@link setValueByPath} wholesale,
 * while on the mounted-field path only `shouldDirty: false` applies — the
 * write lands as a commit while the field's own mode gating keeps driving
 * validation, which is the point of this channel.
 *
 * @param form
 * @param name
 * @param value
 * @param options
 */
export function changeValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(
  form: Form<T>,
  name: P,
  value: PathValueOf<T, P>,
  options?: SetFieldOptions
): void {
  changeValueByPath(form, createPath(name), value, options);
}

/**
 * Set a field value as a user change, by parsed path
 * @param form
 * @param path
 * @param value
 * @param options
 */
export function changeValueByPath(
  form: Form,
  path: Path,
  value: any,
  options?: SetFieldOptions
): void {
  // The baseline must land before the mounted field's change pipeline runs
  // — its write emits synchronously and subscribers read dirty state
  // inside the emission, so installing after the call would flash
  // dirty-then-clean.
  if (options?.shouldDirty === false) setDirtyBaseline(form, path, value);
  if (fieldModes.get(form)?.get(path.key)) {
    // Mounted field: ride the gated user-change pipeline — the field's
    // own mode drives validation, so `shouldValidate`/`shouldTouch` have
    // no meaning here (forcing them would defeat the gating).
    userChangeByPath(form, path, value);
  } else {
    setValueByPath(form, path, value, options);
  }
}

/**
 * Register a mounted field's `mode` override at `path` for user-change
 * gating ({@link userChangeByPath} / {@link userBlur}). Returns the
 * registration token for {@link unregisterFieldMode} plus whether the
 * slot was already occupied — two fields mounted at one path is almost
 * always a bug: the latest mount's mode governs every user-change write
 * there, which the React layer warns about in DEV.
 *
 * @param form
 * @param path
 * @param mode the field's `mode` option, or undefined to follow
 *        {@link Form.mode}
 * @return `token` to hand to {@link unregisterFieldMode}; `displaced`
 *         true when a previous registration at the same path still owned
 *         the slot
 */
export function registerFieldMode(
  form: Form,
  path: Path,
  mode: ValidationMode | undefined
): {token: object; displaced: boolean} {
  let modes = fieldModes.get(form);
  if (!modes) {
    modes = new Map();
    fieldModes.set(form, modes);
  }
  const displaced = modes.has(path.key);
  const token = {};
  modes.set(path.key, {mode, token});
  return {token, displaced};
}

/** Drop a {@link registerFieldMode} registration. A later mount at the
 * same path keeps its slot: only the entry owned by `token` is removed. */
export function unregisterFieldMode(
  form: Form,
  path: Path,
  token: object
): void {
  const modes = fieldModes.get(form);
  const entry = modes?.get(path.key);
  if (modes && entry && entry.token === token) modes.delete(path.key);
}

/** The user-change validation gate shared by a mounted field's onChange
 * and {@link changeValueByPath}: kick the field's validator, the
 * form-level `validateDeps` re-run and the field-level `validateDeps`
 * dependents under the mode/reValidateMode matrix. The live (stored)
 * error view arms the reValidate kick — an error hidden behind a render
 * layer's delayError window still counts, so typing can clear it before
 * it ever shows. */
function runUserChangeGate(form: Form, path: Path, mode: ValidationMode): void {
  if (
    mode === 'onChange' ||
    mode === 'all' ||
    (mode === 'onTouched' && hasTouchedByPath(form, path)) ||
    (getFieldErrorsByPath(form, path).length > 0 &&
      form.reValidateMode === 'onChange')
  )
    form.validators.get(path.key)?.();
  // Form-level validate deps: a user change to a listed field re-runs the
  // form-level validate under the same mode/reValidateMode gating above
  // (evaluated against the last round's own error footprint). No-op for
  // forms without validateDeps.
  revalidateFormOnChange(form, path, mode);
  // Form-level validate cadence (Options.validateMode): 'onChange' re-runs
  // the form-level validate on every user change — no dep list required
  // (TanStack validators.onChange). The round's own footprint reclaim
  // still applies, so a passing re-run clears what the previous round
  // wrote. Fire-and-forget like the dep re-run above.
  if (form.validateMode === 'onChange' && form.validate) {
    runFormValidate(form).catch(() => {});
  }
  // Field-level validate deps: fields that declared this path re-run their
  // own validators under the same gate. No-op when nobody declared it.
  revalidateDependentsOnChange(form, path, mode);
}

/**
 * Write a bound field's user change by path: the write plus the
 * mode/reValidateMode-gated validation pipeline — what a bound field's
 * onChange does when the user types. Reads the effective mode from the
 * field-mode registry (the latest mount's override governs), so a plain
 * write happens when no field is registered at `path`. Framework
 * adapters (React's `useField`, a Solid binding) forward their field
 * change events here.
 *
 * @param form
 * @param path
 * @param value
 */
export function userChangeByPath(form: Form, path: Path, value: any): void {
  setValueByPath(form, path, value);
  const entry = fieldModes.get(form)?.get(path.key);
  if (entry) runUserChangeGate(form, path, entry.mode ?? form.mode);
}

/**
 * A bound field's blur: mark the path touched, then kick its validator
 * under the blur-side gate (`mode` `'onBlur'`/`'onTouched'`/`'all'`, or
 * `reValidateMode: 'onBlur'` while the field carries a live error). The
 * touched marking is unconditional — a field counts as touched on blur
 * regardless of mode. Framework adapters forward field blur events here.
 *
 * @param form
 * @param path
 */
export function userBlur(form: Form, path: Path): void {
  setTouchedByPath(form, path);
  const entry = fieldModes.get(form)?.get(path.key);
  if (!entry) return;
  const mode = entry.mode ?? form.mode;
  if (
    mode === 'onBlur' ||
    mode === 'onTouched' ||
    mode === 'all' ||
    (getFieldErrorsByPath(form, path).length > 0 &&
      form.reValidateMode === 'onBlur')
  )
    form.validators.get(path.key)?.();
  // Form-level validate cadence (Options.validateMode): 'onBlur' re-runs
  // the form-level validate on every user blur — TanStack
  // validators.onBlur. Same fire-and-forget contract as the change-side
  // cadence.
  if (form.validateMode === 'onBlur' && form.validate) {
    runFormValidate(form).catch(() => {});
  }
}

/**
 * Get field error
 * @param form
 * @param name
 * @return FieldError object or undefined
 */
