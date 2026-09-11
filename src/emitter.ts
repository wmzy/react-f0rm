/** Typed event emitter — a facade over `@for-fun/event-emitter`, kept
 * external in ESM/CJS so apps sharing the dependency dedupe it; only the
 * self-contained UMD bundle inlines it. The API is re-exported verbatim:
 * `create` (branded `EventEmitter<T>` handle), emit/on/once/off/error
 * channel and `setMaxListeners`. */
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
