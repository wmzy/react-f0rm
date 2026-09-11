import {emit} from '../emitter';
import type {Form} from '../form';
import type {Path} from '../path';
import {getOrCreate} from './internals';

/** Per-form registry of bound fields' own `disabled` options — path key →
 * `{disabled, token}`, the signal behind subtree propagation: a field
 * declared `disabled: true` disables every descendant, and a descendant
 * declares `disabled: false` to opt back out. WeakMap so the Form shape
 * carries only plain state fields. Internal: hooks import it directly, the
 * facade never re-exports it. */
const fieldDisabledRegistry = new WeakMap<
  Form,
  Map<string, {disabled: boolean; token: object}>
>();

/** Register a bound field's `disabled` option at `path`. Returns the
 * registration token for {@link unregisterFieldDisabled}, or `null` when
 * the option is `undefined` — a field that never declares `disabled`
 * registers nothing. Emits a path-payload `'disabled'` event so
 * descendants re-render when an ancestor's flag flips. */
export function registerFieldDisabled(
  form: Form,
  path: Path,
  disabled: boolean | undefined
): {token: object} | null {
  if (disabled === undefined) return null;
  const registry = getOrCreate(fieldDisabledRegistry, form, () => new Map());
  const token = {};
  registry.set(path.key, {disabled, token});
  emit(form.emitter, 'disabled', path);
  return {token};
}

/** Drop a {@link registerFieldDisabled} registration; only the entry owned
 * by `token` is removed. Emits the path-payload `'disabled'` so
 * descendants re-render. */
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

/** Is any ancestor of `path` declared `disabled: true`? O(depth) prefix
 * lookups over the registry — the merged-disabled rule a bound field
 * evaluates on render:
 * `form.disabled || own === true || (own !== false && hasDisabledAncestor)`. */
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
