// Ambient types for the 'use-sync-external-store/shim' subpath
// (use-sync-external-store@1.6 ships no .d.ts files). The third argument
// mirrors React's own signature: the runtime shim forwards it to React's
// useSyncExternalStore, and we pass it since SSR support (same snapshot
// getter on both sides — form state is synchronously readable).
declare module 'use-sync-external-store/shim' {
  export function useSyncExternalStore<Snapshot>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => Snapshot,
    getServerSnapshot?: () => Snapshot
  ): Snapshot;
}
