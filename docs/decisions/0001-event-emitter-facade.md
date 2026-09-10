# ADR-0001: Event emitter stays a shared runtime dependency (facade, not vendor)

- **Status:** Accepted
- **Date:** 2026-09-10
- **Applies to:** `src/emitter.ts`, `package.json` (`dependencies`, rollup externals, size-limit ignore lists)

## Context

The form's event core needs a tiny typed emitter. Two options:

1. **Vendor** a copy of `@for-fun/event-emitter` into `src/emitter.ts` — zero runtime dependencies, full control, ~0.1 KB gzip added to the core bundle.
2. **Depend** on `@for-fun/event-emitter` (same author) — `src/emitter.ts` becomes a verbatim re-export facade.

History: an earlier session vendored the emitter (zero-dependency migration), then the author explicitly reversed that decision — upper-layer apps may share the dependency, and dedupe is the win. This ADR records the decision so it is not re-litigated per session.

## Decision

`src/emitter.ts` is a **verbatim re-export facade** over the `@for-fun/event-emitter` runtime dependency.

- `dependencies`: `@for-fun/event-emitter` (^1.1.0), typed event tables (`EventEmitterT`) used for `FormEvents`.
- **ESM/CJS builds and `d.ts` keep it external.** Rollup `external` includes it; the published `d.ts` references the package's brand types — an inline copy's `unique symbol` would not match the real package's, so apps passing `form.emitter` to the package's `on()`/`emit()` would fail type checking.
- **UMD inlines it** — a `<script>` tag has no module graph, self-containment wins.
- **size-limit measures the core with the emitter ignored** (`"ignore": ["@for-fun/event-emitter"]`) — the core-only figure; +0 when the app already depends on it, ~+0.1 KB gzip when a bundler inlines it.

## Consequences

- **Dedupe** in apps that already use `@for-fun/event-emitter`; `Form.emitter` type-interoperates with its public API (`on()`/`emit()` payload checking via the `FormEvents` table).
- **The honest cost:** the dependency is single-maintainer, low-adoption — a supply-chain and bus-factor risk on top of this library's own.
- **The escape hatch is real and small:** the emitter surface is one file (`src/emitter.ts`); the event contract is the typed `FormEvents` table in `src/form.ts`. Re-vendoring would only need to preserve the same table and update rollup externals + size-limit ignore lists + the UMD config.
- New emitter events must first extend the `FormEvents` table; subscription callbacks must match the declared payloads.
