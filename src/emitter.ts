/**
 * Typed event emitter — a facade over `@for-fun/event-emitter`, a runtime
 * dependency kept **external** in every ESM/CJS build output: an app that
 * already depends on it (it is a shared base library by the same author)
 * reuses its copy through npm dedupe instead of paying a bundled one. Only
 * the self-contained UMD bundle inlines it — a script-tag consumer has no
 * module graph to dedupe against.
 *
 * The package's API is re-exported verbatim: `create` (branded
 * `EventEmitter<T>` handle whose event table drives the payload typing),
 * `emit`/`on`/`once`/`off`/`removeAllListeners`, the error channel
 * (`emitError`/`onError`/`onceError`) and `setMaxListeners`.
 */
export {
  create,
  emit,
  emitError,
  on,
  off,
  removeAllListeners,
  onError,
  once,
  onceError,
  setMaxListeners
} from '@for-fun/event-emitter';
export type {
  EventEmitter,
  EventType,
  Handler,
  ErrorHandler,
  OffFunction
} from '@for-fun/event-emitter';
