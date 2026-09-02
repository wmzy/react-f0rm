import {on} from '@for-fun/event-emitter';
import type {EventEmitter} from '@for-fun/event-emitter';
import createPath from './path';
import type {Name, Path} from './path';
import type {Form} from './form';

/** Subscription granularity for {@link onPathEvent}.
 * - `'leaf'`: the subscriber reads exactly one key ({@link
 *   useValueByPath}); only writes at that key or above it can change what
 *   it reads.
 * - `'branch'`: the subscriber aggregates a whole subtree below a key
 *   ({@link useFieldArray}); descendant writes matter too. */
export type WatchScope = 'leaf' | 'branch';

/**
 * Is `key` a strict descendant of `ancestorKey`?
 *
 * Keys are JSON.stringify'd segment arrays ('["a","b"]'), so a descendant
 * key is the ancestor key minus its closing ']' followed by a ','
 * ('["a","b",'). The ',' separator is mandatory: a plain prefix match
 * would let the sibling '["tagsX"]' pass as a descendant of '["tags"]'.
 */
function isDescendant(key: string, ancestorKey: string): boolean {
  return key.startsWith(`${ancestorKey.slice(0, -1)},`);
}

/**
 * Subscribe to `event`, invoking `cb` only when the emitted path is
 * relevant to `path`.
 *
 * Payload-less broadcasts (reset, setInitialValues) always invoke `cb` --
 * they are global syncs and the correctness fallback. (removeFieldByPath
 * emits with its path: its mutations are bounded to that key, so the path
 * matching below is exact.) When the emit carries a path P:
 * - `'leaf'`: P.key equals `path.key` or is one of its ancestors -- a leaf
 *   read falls back to ancestor values (getValueByPath), so ancestor
 *   writes must invalidate, while sibling and descendant writes cannot
 *   change what the leaf reads.
 * - `'branch'`: `'leaf'` semantics plus P.key being a descendant of
 *   `path.key` -- changed descendants re-aggregate the subtree.
 *
 * @param emitter emitter to subscribe to
 * @param event event name
 * @param path the watched path
 * @param scope which writes around `path` are relevant
 * @param cb listener, invoked with no arguments
 * @return unsubscribe function
 */
export function onPathEvent(
  emitter: EventEmitter,
  event: string,
  path: Path,
  scope: WatchScope,
  cb: () => void
): () => void {
  const {key} = path;
  return on(emitter, event, (changed?: Path) => {
    if (
      changed === undefined ||
      changed.key === key ||
      isDescendant(key, changed.key) ||
      (scope === 'branch' && isDescendant(changed.key, key))
    ) {
      cb();
    }
  });
}

/**
 * Subscribe to `event`, invoking `cb` only when the emitted path's key is
 * exactly `key` (or the emit carries no payload -- a global sync).
 *
 * For state stored per exact key (errors, touched) no ancestor or
 * descendant matching is wanted: another field's key must not wake this
 * subscriber.
 *
 * @param emitter emitter to subscribe to
 * @param event event name
 * @param key exact path key to match
 * @param cb listener, invoked with no arguments
 * @return unsubscribe function
 */
export function onKeyEvent(
  emitter: EventEmitter,
  event: string,
  key: string,
  cb: () => void
): () => void {
  return on(emitter, event, (changed?: Path) => {
    if (changed === undefined || changed.key === key) cb();
  });
}

/** Events {@link subscribe} can watch. `'errors'` and `'touched'` are
 * stored per exact key, so they match exact keys ({@link onKeyEvent});
 * `'change'`, `'submitting'` and `'submitCount'` carry paths and go
 * through {@link onPathEvent}. */
export type SubscribeEvent =
  'change' | 'errors' | 'touched' | 'submitting' | 'submitCount';

/** Options accepted by {@link subscribe}. */
export type SubscribeOptions = {
  /** Path (or list of paths) to watch. Omit to receive every emission of
   * `event`, payload-less broadcasts included. A single segments path
   * (`['tags', 0]`) and a list of names (`['tags', 'user.name']`) are told
   * apart by the same rule `trigger` uses: only a segments path can hold
   * a number. */
  name?: Name | Name[];
  /** Event to watch. Defaults to `'change'`. */
  event?: SubscribeEvent;
  /** Which writes around `name` are relevant — `'leaf'` or `'branch'`.
   * Only meaningful for `'change'`: `'errors'`/`'touched'` match exact
   * keys and `'submitting'`/`'submitCount'` are payload-less. Defaults to
   * `'branch'` — the intuitive linkage semantics, where subscribing to
   * `'tags'` means the whole branch. */
  scope?: WatchScope;
  /** Invoked with no arguments after each matching emission. Read fresh
   * state through the `get*` readers inside it. */
  callback: () => void;
};

/** Is `name` a list of names rather than one segments path? Numbers only
 * occur inside a segments path (`['a', 0]`), never as standalone names —
 * the same disambiguation `trigger` applies to its name argument. */
function isNameList(name: Name | Name[]): name is Name[] {
  return (
    Array.isArray(name) &&
    (name as (number | unknown)[]).every(part => typeof part !== 'number')
  );
}

/**
 * Subscribe to form events imperatively — the non-render counterpart of
 * the `use*` hooks: linkages and side effects (province changed → clear
 * city, autosave, analytics) run without mounting a watching component.
 *
 * Without `name`, `callback` fires on every `event` emission, payload-less
 * broadcasts (reset, setInitialValues) included. With `name`, matching
 * follows the event's shape: `'errors'`/`'touched'` match the exact key
 * ({@link onKeyEvent}) — another field's error never wakes this
 * subscriber — while `'change'`/`'submitting'`/`'submitCount'` go through
 * {@link onPathEvent}, so the default `'branch'` scope wakes a `'tags'`
 * subscriber when any `tags.*` descendant is written. A `name` array
 * builds one subscription per path and the returned function unsubscribes
 * them all.
 *
 * @param form the form to watch
 * @param options event, name(s), scope and callback
 * @return unsubscribe function
 */
export function subscribe(form: Form, options: SubscribeOptions): () => void {
  const {name, event = 'change', scope = 'branch', callback} = options;
  if (name === undefined) return on(form.emitter, event, callback);
  const names = isNameList(name) ? name : [name];
  const unsubscribes = names.map(one => {
    const path = createPath(one);
    return event === 'errors' || event === 'touched'
      ? onKeyEvent(form.emitter, event, path.key, callback)
      : onPathEvent(form.emitter, event, path, scope, callback);
  });
  return unsubscribes.length === 1
    ? unsubscribes[0]
    : () => unsubscribes.forEach(unsubscribe => unsubscribe());
}
