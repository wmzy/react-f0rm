import {emit} from '../emitter';
import type {Form} from '../form';
import type {Path} from '../path';

/**
 * Per-form registry of bound fields' own `disabled` options — path key →
 * `{disabled, token}`, the signal behind subtree propagation: a field
 * declared `disabled: true` disables every descendant field, and a
 * descendant declares `disabled: false` to opt back out (react-hook-form
 * subtree semantics). Held in a WeakMap so the Form shape carries only
 * plain state fields. This module is internal: hooks import it directly
 * (like `core/unmount`), the facade never re-exports it.
 */
const fieldDisabledRegistry = new WeakMap<
  Form,
  Map<string, {disabled: boolean; token: object}>
>();

/**
 * Register a bound field's `disabled` option at `path`. Returns the
 * registration token for {@link unregisterFieldDisabled}, or `null` when
 * the option is `undefined` — a field that never declares `disabled`
 * registers nothing, so plain forms pay zero extra work.
 *
 * The registration emits a path-payload `'disabled'` event: descendant
 * fields subscribe with branch scope and re-render when an ancestor's
 * flag flips (mount/unmount of a disabled parent included).
 */
export function registerFieldDisabled(
  form: Form,
  path: Path,
  disabled: boolean | undefined
): {token: object} | null {
  if (disabled === undefined) return null;
  let registry = fieldDisabledRegistry.get(form);
  if (!registry) {
    registry = new Map();
    fieldDisabledRegistry.set(form, registry);
  }
  const token = {};
  registry.set(path.key, {disabled, token});
  emit(form.emitter, 'disabled', path);
  return {token};
}

/** Drop a {@link registerFieldDisabled} registration. Only the entry
 * owned by `token` is removed — a later mount at the same path keeps its
 * slot. Emits the path-payload `'disabled'` so descendants re-render. */
export function unregisterFieldDisabled(
  form: Form,
  path: Path,
  token: object
): void {
  const registry = fieldDisabledRegistry.get(form);
  const entry = registry?.get(path.key);
  if (registry && entry && entry.token === token) {
    registry.delete(path.key);
    emit(form.emitter, 'disabled', path);
  }
}

/**
 * Is any ancestor of `path` declared `disabled: true`? O(depth) prefix
 * lookups over the registry — the merged-disabled rule a bound field
 * evaluates on render:
 * `form.disabled || own === true || (own !== false && hasDisabledAncestor)`.
 */
export function hasDisabledAncestor(form: Form, path: Path): boolean {
  const registry = fieldDisabledRegistry.get(form);
  if (!registry?.size) return false;
  const segments = path.value;
  for (let i = 1; i < segments.length; i++) {
    const prefix = JSON.stringify(segments.slice(0, i));
    if (registry.get(prefix)?.disabled) return true;
  }
  return false;
}
