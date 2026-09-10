---
sidebar_position: 5
---

# Breaking Changes

## 1.0

- **`react >=18` peer.** The `use-sync-external-store` shim is gone — subscriptions use React's native `useSyncExternalStore`. The event emitter stopped being vendored: `src/emitter.ts` is now a facade over the `@for-fun/event-emitter` runtime dependency (external in ESM/CJS builds, so apps already depending on it dedupe the copy; the UMD bundle stays self-contained). See [ADR-0001](https://github.com/wmzy/react-f0rm/blob/main/docs/decisions/0001-event-emitter-facade.md).
- **`reset` keep-flag split.** `keepIsSubmitted` now keeps the new `isSubmitted` flag (set on every submit attempt, cleared by reset — RHF's `formState.isSubmitted` semantics). Keeping the last submit's success flag is the new `keepIsSubmitSuccessful`. Previously `keepIsSubmitted` controlled `isSubmitSuccessful`; migration is a one-word rename for that use case.
- **`useFieldArray` unmount.** Unmounting the array now removes its branch by default (tombstone), exactly like a bound field — previously the values silently stayed. Keep them with `shouldUnregister: false` per array, or `createForm({shouldUnregister: false})` form-wide.
- **`setValue` functions are updaters.** `setValue(form, 'count', c => c + 1)` updates from the current value (TanStack's `setFieldValue` contract); a function can no longer itself be stored as a field value through `setValue`.

## 0.2

v0.2 structures the error model (`FieldError`), changes unregister/reset/native-validation semantics, and more — see the [v0.1 → v0.2 migration guide](./v0.1-to-v0.2.md).
