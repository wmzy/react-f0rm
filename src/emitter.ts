/**
 * Typed event emitter, vendored from @for-fun/event-emitter@1.1.0 (MIT,
 * same author as this package) so react-f0rm ships zero runtime
 * dependencies. Runtime semantics preserved verbatim:
 *
 * - listeners live in a `Map<key, Set<handler>>`
 * - a throwing handler never stops its peers: errors are collected while
 *   the remaining handlers still run, then reported through the error
 *   channel; with no error handler subscribed the first collected error is
 *   rethrown to the emit caller instead of being swallowed
 * - in-flight emits follow Set iteration semantics: a listener added while
 *   the emit runs is still visited by that emit, a listener removed before
 *   its turn is skipped, and removing a whole key mid-emit does not affect
 *   it
 * - DEV builds warn about potential listener leaks above 10 handlers per
 *   key; `setMaxListeners(ee, 0)` disables the warning
 *
 * The event table typing follows the upstream package: `EventEmitter<T>`
 * is a branded handle whose `T` declares each event as either a bare
 * `EventType` (payload `[]`) or a `[EventType, payload]` tuple.
 */

/** Valid event key: a string or a unique symbol (the internal error
 * channel). */
export type EventType = string | symbol;

/** One entry of an event table: a bare event type (payload-less), or a
 * `[type, payload tuple]` pair. */
export type EventEntry = [EventType, any[]] | EventType;

declare const table: unique symbol;

/** Branded emitter handle carrying its event table as `T`. Branded so only
 * {@link create} produces one — the typing of `emit`/`on` payloads keys
 * off it. */
export type EventEmitter<T extends EventEntry = [any, any[]]> = {
  [table]: T;
};

type Key<T extends EventEntry> =
  Extract<T, [EventType, any[]]>[0] | Extract<T, EventType>;

type Param<T extends EventEntry, K extends Key<T>> = [K] extends [
  Extract<T, EventType>
]
  ? []
  : Extract<T, [K, any[]]>[1];

/** A listener for the event it is registered under. */
export type Handler<P extends any[] = any[]> = (...args: P) => any;

/** A listener on the error channel: receives a handler's thrown error. */
export type ErrorHandler = (err: Error) => any;

/** Unsubscribe function returned by {@link on}/{@link once}. */
export type OffFunction = () => void;

/** DEV-only flag, replaced at build time (rollup.config.js `replace`);
 * defined for the test environment in vitest.config.ts. */
declare const __DEV__: boolean;

const DEFAULT_MAX_LISTENERS = 10;
const maxListenersMap = new WeakMap<EventEmitter, number>();
const warnedKeysMap = new WeakMap<EventEmitter, Set<EventType>>();

function getSet(ee: EventEmitter, key: EventType): Set<Handler> {
  const map = ee as unknown as Map<EventType, Set<Handler>>;
  const existing = map.get(key);
  if (existing) return existing;
  const set = new Set<Handler>();
  map.set(key, set);
  return set;
}

function setMaxListeners(ee: EventEmitter, maxListeners: number): void {
  maxListenersMap.set(ee, maxListeners);
}

function checkMaxListeners(
  ee: EventEmitter,
  key: EventType,
  size: number
): void {
  const max = maxListenersMap.get(ee) ?? DEFAULT_MAX_LISTENERS;
  if (max <= 0 || size <= max) return;
  let warnedKeys = warnedKeysMap.get(ee);
  if (!warnedKeys) {
    warnedKeys = new Set();
    warnedKeysMap.set(ee, warnedKeys);
  }
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `Possible event-emitter memory leak: ${size} "${String(key)}" listeners added. ` +
      'Use setMaxListeners(ee, n) to raise the limit, or 0 to disable this warning.'
  );
}

/** Internal error channel every emitter carries. */
const errorEvent: unique symbol = Symbol('error');

/** Create an empty emitter. */
export function create<T extends EventEntry = [any, any[]]>(): EventEmitter<T> {
  return new Map() as unknown as EventEmitter<T>;
}

/**
 * Emit `key` with `args` as the handler payload. A throwing handler does
 * not stop its peers: errors are collected while the remaining handlers
 * run, then each is reported through the error channel; with no error
 * handler subscribed, the first collected error is rethrown to the emit
 * caller.
 */
export function emit<
  E extends EventEmitter<any>,
  const K extends Key<E[typeof table]>
>(ee: E, key: K, ...args: Param<E[typeof table], K>): void;
export function emit(
  ee: EventEmitter<any>,
  key: EventType,
  ...args: any[]
): void {
  const set = (ee as unknown as Map<EventType, Set<Handler>>).get(key);
  if (!set || !set.size) return;
  let errors: Error[] | undefined;
  set.forEach(h => {
    try {
      h(...args);
    } catch (err) {
      (errors ??= []).push(err as Error);
    }
  });
  if (errors) for (const err of errors) emitError(ee, err);
}

/** Report a handler error through the error channel; rethrows when nothing
 * listens. */
export function emitError(ee: EventEmitter<any>, err: Error): void {
  const handlerSet = (ee as unknown as Map<EventType, Set<Handler>>).get(
    errorEvent
  );
  if (!handlerSet || !handlerSet.size) throw err;
  handlerSet.forEach(h => h(err));
}

/**
 * Subscribe `handler` to `key`. Returns an unsubscribe function removing
 * exactly this handler.
 */
export function on<
  E extends EventEmitter<any>,
  const K extends Key<E[typeof table]>
>(ee: E, key: K, handler: Handler<Param<E[typeof table], K>>): OffFunction {
  const set = getSet(ee, key);
  set.add(handler);
  if (__DEV__) checkMaxListeners(ee, key, set.size);
  return () => set.delete(handler);
}

/** Remove listeners: `off(ee)` clears everything, `off(ee, key)` clears
 * the key, `off(ee, key, handler)` removes one handler. */
export function off(ee: EventEmitter<any>): void;
export function off<
  E extends EventEmitter<any>,
  const K extends Key<E[typeof table]>
>(ee: E, key: K, handler?: Handler<Param<E[typeof table], K>>): void;
export function off(
  ee: EventEmitter<any>,
  key?: EventType,
  handler?: Handler
): void {
  const map = ee as unknown as Map<EventType, Set<Handler>>;
  if (key === undefined) {
    map.clear();
    return;
  }
  const set = map.get(key);
  if (!set) return;
  if (handler === undefined) {
    map.delete(key);
    return;
  }
  set.delete(handler);
}

/** Clear every listener: `removeAllListeners(ee)` for the whole emitter,
 * `removeAllListeners(ee, key)` for one key. */
export function removeAllListeners(ee: EventEmitter<any>): void;
export function removeAllListeners(ee: EventEmitter<any>, key: EventType): void;
export function removeAllListeners(
  ee: EventEmitter<any>,
  key?: EventType
): void {
  const map = ee as unknown as Map<EventType, Set<Handler>>;
  if (key === undefined) map.clear();
  else map.delete(key);
}

/** Subscribe to the error channel: called once per handler error with the
 * thrown value. */
export function onError(
  ee: EventEmitter<any>,
  handler: ErrorHandler
): OffFunction {
  const set = getSet(ee, errorEvent);
  set.add(handler);
  if (__DEV__) checkMaxListeners(ee, errorEvent, set.size);
  return () => set.delete(handler);
}

/** Like {@link on}, but the handler runs at most once — it is removed
 * before it fires. */
export function once<
  E extends EventEmitter<any>,
  const K extends Key<E[typeof table]>
>(ee: E, key: K, handler: Handler<Param<E[typeof table], K>>): OffFunction {
  const offFn = on(ee, key, (...args) => {
    offFn();
    handler(...args);
  });
  return offFn;
}

/** Like {@link once} on the error channel. */
export function onceError(
  ee: EventEmitter<any>,
  handler: ErrorHandler
): OffFunction {
  const offFn = onError(ee, err => {
    offFn();
    handler(err);
  });
  return offFn;
}

export {setMaxListeners};
