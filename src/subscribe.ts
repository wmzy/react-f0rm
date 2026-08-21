import {on} from '@for-fun/event-emitter';
import type {EventEmitter} from '@for-fun/event-emitter';
import type {Path} from './path';

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
 * Payload-less broadcasts (reset, removeFieldByPath, setInitialValues)
 * always invoke `cb` -- they are global syncs and the correctness
 * fallback. When the emit carries a path P:
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
