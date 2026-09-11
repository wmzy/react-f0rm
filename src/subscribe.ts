import {on} from './emitter';
import type {EventEmitter} from './emitter';
import createPath from './path';
import type {Name, Path} from './path';
import type {Form, FormEvents} from './form';

/** Subscription granularity for {@link onPathEvent}: `'leaf'` reads one
 * key (only writes at it or above matter); `'branch'` aggregates a whole
 * subtree (descendant writes matter too). */
export type WatchScope = 'leaf' | 'branch';

/**
 * Is `key` a strict descendant? Keys are JSON-stringified segment arrays,
 * so a descendant is the ancestor key minus its closing ']' plus ','; the
 * mandatory ',' keeps sibling '["tagsX"]' from matching '["tags"]'.
 */
function isDescendant(key: string, ancestorKey: string): boolean {
  return key.startsWith(`${ancestorKey.slice(0, -1)},`);
}

/**
 * Subscribe to `event`, invoking `cb` only when the emitted path is
 * relevant. Payload-less broadcasts always invoke (global sync). With a
 * path P: `'leaf'` fires on P == path or an ancestor (leaf reads fall back
 * to ancestor values); `'branch'` also fires on descendants, which
 * re-aggregate the subtree.
 */
export function onPathEvent(
  emitter: EventEmitter<FormEvents>,
  event: SubscribeEvent,
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
 * Subscribe to `event`, invoking `cb` only on exact key matches (or a
 * payload-less global sync). Exact-key state (errors, touched) wants no
 * ancestor/descendant matching.
 */
export function onKeyEvent(
  emitter: EventEmitter<FormEvents>,
  event: SubscribeEvent,
  key: string,
  cb: () => void
): () => void {
  return on(emitter, event, (changed?: Path) => {
    if (changed === undefined || changed.key === key) cb();
  });
}

/** Events {@link subscribe} can watch. `'errors'`/`'touched'` match exact
 * keys ({@link onKeyEvent}); `'change'`/`'validating'` match by path
 * ({@link onPathEvent}); the rest are payload-less broadcasts every
 * subscriber hears. */
export type SubscribeEvent =
  | 'change'
  | 'errors'
  | 'touched'
  | 'validating'
  | 'submitting'
  | 'submitCount'
  | 'submitSuccessful'
  | 'disabled'
  | 'status'
  | 'loading';

export type SubscribeOptions = {
  /** Path or paths to watch; omit to receive every emission. A segments
   * path vs a name list is told apart by `trigger`'s rule: only segments
   * hold a number. */
  name?: Name | Name[];
  /** Event to watch. Defaults to `'change'`. */
  event?: SubscribeEvent;
  /** Which writes around `name` are relevant. Only meaningful for the
   * path-carrying events; defaults to `'branch'` (subscribing to `'tags'`
   * means the whole branch). */
  scope?: WatchScope;
  /** Invoked after each matching emission; read fresh state through the
   * `get*` readers inside it. */
  callback: () => void;
};

/** A segments path can hold a number (`['a', 0]`), a name list never can —
 * the same disambiguation `trigger` applies to its name argument. */
function isNameList(name: Name | Name[]): name is Name[] {
  return (
    Array.isArray(name) &&
    (name as (number | unknown)[]).every(part => typeof part !== 'number')
  );
}

/**
 * Subscribe to form events imperatively — the non-render counterpart of
 * the `use*` hooks. Without `name`, `callback` fires on every emission;
 * with `name`, matching follows the event's shape (`'errors'`/`'touched'`
 * match exact keys, the rest match by path or broadcast). A name array
 * builds one subscription per path.
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

/** The handle {@link watch} returns: a subscribe/getSnapshot pair any
 * reactive runtime can bind to. One internal listener stays alive from
 * creation, so `getSnapshot()` is always fresh; `dispose` ends it. */
export type WatchHandle<T> = {
  /** Read the current snapshot, cached between events; repeated reads
   * share one reference until state changes. */
  getSnapshot: () => T;
  /** Register a change listener; fires only when the projection changed.
   * With `isEqual`, an equal verdict skips the callback; without one,
   * every event wakes it. */
  subscribe: (invalidate: () => void) => () => void;
  /** Remove the internal listener and every consumer callback; the handle
   * is dead afterwards. */
  dispose: () => void;
};

/**
 * Watch a projection of form state without React — the framework-free
 * {@link useWatch} (same `isEqual` bailout), tree-shaken when unused.
 * Returns a {@link WatchHandle}: read `getSnapshot()`, re-read/re-render
 * when `subscribe`'s listener fires. The handle subscribes eagerly, so
 * reads are never stale; `getter`/`isEqual` are captured at creation.
 */
export function watch<T>(
  form: Form,
  event: SubscribeEvent,
  getter: () => T,
  isEqual?: (prev: T, next: T) => boolean
): WatchHandle<T> {
  const cache: {hasValue: boolean; value?: T} = {hasValue: false};
  const consumers = new Set<() => void>();
  const wake = () => {
    if (isEqual && cache.hasValue) {
      // Custom comparator: decide before waking consumers. Equal means
      // unchanged — keep the cache and skip; unequal stores the fresh
      // snapshot so the next read needs no recompute.
      const next = getter();
      if (isEqual(cache.value as T, next)) return;
      cache.value = next;
    } else {
      cache.value = getter();
      cache.hasValue = true;
    }
    consumers.forEach(invalidate => invalidate());
  };
  // Eager: the cache tracks the form from creation, so reads are fresh
  // even before any consumer subscribes.
  const off = on(form.emitter, event, wake);
  return {
    getSnapshot: () => {
      if (!cache.hasValue) {
        cache.value = getter();
        cache.hasValue = true;
      }
      return cache.value as T;
    },
    subscribe: (invalidate: () => void) => {
      consumers.add(invalidate);
      return () => {
        consumers.delete(invalidate);
      };
    },
    dispose: () => {
      off();
      consumers.clear();
    }
  };
}
