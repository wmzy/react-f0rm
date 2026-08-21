// Ambient types for the 'use-sync-external-store/shim' subpath
// (use-sync-external-store@1.6 ships no .d.ts files). Only the two-argument
// form is declared: this client-only library never passes getServerSnapshot.
declare module 'use-sync-external-store/shim' {
  export function useSyncExternalStore<Snapshot>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => Snapshot
  ): Snapshot;
}
