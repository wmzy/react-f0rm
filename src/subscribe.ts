import {on} from './emitter';
import type {EventEmitter} from './emitter';
import createPath from './path';
import type {Name, Path} from './path';
import type {Form, FormEvents} from './form';

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
  emitter: EventEmitter<FormEvents>,
  event: SubscribeEvent,
  key: string,
  cb: () => void
): () => void {
  return on(emitter, event, (changed?: Path) => {
    if (changed === undefined || changed.key === key) cb();
  });
}

/** Events {@link subscribe} can watch. `'errors'` and `'touched'` are
 * stored per exact key, so they match exact keys ({@link onKeyEvent});
 * `'change'`, `'validating'`, `'submitting'`, `'submitCount'`,
 * `'disabled'`, `'status'` and `'submitSuccessful'` go through
 * {@link onPathEvent}. `'validating'` carries paths (one per async
 * validator round) and matches by path exactly like `'change'`;
 * `'submitting'`, `'submitCount'`, `'disabled'`, `'status'` and
 * `'submitSuccessful'` are payload-less broadcasts, so `name` never
 * narrows them — every subscriber hears every emission. */
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
   * Only meaningful for the path-carrying events `'change'` and
   * `'validating'`: `'errors'`/`'touched'` match exact keys and
   * `'submitting'`/`'submitCount'`/`'disabled'`/`'status'`/
   * `'submitSuccessful'` are payload-less. Defaults to `'branch'` — the
   * intuitive linkage semantics, where subscribing to `'tags'` means the
   * whole branch. */
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
 * subscriber — while `'change'`/`'validating'`/`'submitting'`/
 * `'submitCount'`/`'disabled'`/`'submitSuccessful'` go through
 * {@link onPathEvent}, so the default `'branch'` scope wakes a `'tags'`
 * subscriber when any `tags.*` descendant is written. `'validating'`
 * carries a path per validator round and narrows by path like
 * `'change'`; `'disabled'`/`'submitSuccessful'` (like `'submitting'`)
 * are payload-less broadcasts that every named subscriber receives. A
 * `name` array builds one subscription per path and the returned
 * function unsubscribes them all.
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

/** The handle {@link watch} returns: a subscribe/getSnapshot pair any
 * reactive runtime can bind to — React's `useSyncExternalStore(subscribe,
 * getSnapshot)`, a Solid signal, a Vue ref, a Svelte store. The handle
 * keeps one internal listener alive from creation, so `getSnapshot()` is
 * always fresh (a read never returns a pre-write value even with no
 * consumer subscribed); `subscribe` adds a consumer callback and returns
 * its own unsubscribe. Call {@link WatchHandle.dispose} when the handle's
 * lifetime ends (adapter teardown, effect cleanup). */
export type WatchHandle<T> = {
  /** Read the current snapshot. Recomputed on every heard event (and on
   * first read), cached in between — repeated reads share one reference
   * until the watched state actually changes. */
  getSnapshot: () => T;
  /** Register a change listener; returns the unsubscribe function. The
   * listener fires only when the projection observably changed: with an
   * `isEqual` comparator the getter is re-run per event and an equal
   * verdict skips the callback entirely (TanStack's `useSelector`
   * contract); without one, every heard event wakes the listener. */
  subscribe: (invalidate: () => void) => () => void;
  /** Remove the internal listener and every consumer callback. The handle
   * is dead afterwards — reads return the last cached value and no
   * callback ever fires again. */
  dispose: () => void;
};

/**
 * Watch a projection of form state without React — the framework-free
 * counterpart of {@link useWatch} (same signature, same `isEqual`
 * bailout), exported as a named top-level function so it is tree-shaken
 * when unused. Headless adapters (Solid/Vue/Svelte bridges, imperative
 * autosave/analytics code) consume the returned
 * {@link WatchHandle}: read the current snapshot through `getSnapshot()`
 * and re-read (or re-render) whenever `subscribe`'s listener fires.
 *
 * The handle subscribes eagerly at creation, so `getSnapshot()` never
 * returns a stale value — including reads with no consumer subscribed.
 * `getter` and `isEqual` are captured when `watch` is called: call it at
 * setup time, like a subscription, and {@link WatchHandle.dispose} it at
 * teardown. Every emission of `event` wakes the listener (payload-less
 * broadcasts included) — the wide surface `useWatch` uses; path-scoped
 * variants are the `useValue`-family hooks on the React side and
 * {@link subscribe} with a `name` on this side.
 *
 * ```js
 * const handle = watch(form, 'change', () => getValue(form, 'email'));
 * // imperative consumer:
 * const off = handle.subscribe(() => save(handle.getSnapshot()));
 * // React adapter (useWatch is this composition):
 * useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot);
 * handle.dispose(); // teardown
 * ```
 *
 * @param form the form to watch
 * @param event the event whose emissions invalidate the snapshot
 * @param getter the projection — read fresh state through the `get*`
 *        readers inside it
 * @param isEqual optional equality check; an equal verdict after an event
 *        skips the listeners entirely (wide getters returning fresh
 *        references per call stop churning subscribers)
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
      // observably unchanged — keep the cached reference and skip. Unequal
      // stores the fresh snapshot so the next read needs no recompute.
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
  // even before any consumer subscribes (and events emitted between
  // watch() and subscribe() are never missed).
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
