---
sidebar_position: 1
---

# Introduction

react-f0rm is a lightweight, event-driven React form library with fine-grained subscriptions and refined tree-shaking support.

## Features

- **Field-level subscriptions** — each field subscribes to exactly its own state. Typing into one of 100 controlled fields triggers precisely **1 re-render**; a single-field change measures **96µs vs 175µs** for React Hook Form's Controller (~1.8× faster)
- **Event-driven** — efficient updates via an event emitter, powered by `useSyncExternalStore` (no tearing under concurrent rendering)
- **Type-safe paths** — `FieldPath<T>` / `PathValue<T, P>` turn a typo'd field path into a compile error, with the value type resolved at each path
- **Standard Schema support** — one adapter (`react-f0rm/resolvers/standard-schema`) covers zod v3.24+/v4, valibot v1, arktype and every other spec implementer, at field or form level; Zod and Yup resolvers included
- **Accessible by default** — `aria-invalid` on errored inputs, optional `renderError` with `role='alert'` and automatic `aria-describedby` wiring, native constraint bubbles via `checkValidity`/`reportValidity`
- **Multiple errors per field** — every field holds an ordered `FieldError[]`; schema resolvers forward every issue instead of stopping at the first
- **Async validation with cancellation** — `validateDebounce` per field plus an `AbortSignal` in the validator meta; `trigger` resolves `Promise<boolean>` once validation settles
- **Precise lifecycle control** — `reset(form, values, {keepDirtyValues, …})`, `setFocus(form, name)`, typed per-app contexts via `createFormContext<Values>()`
- **SSR out of the box** — `renderToString` renders initial values; hydration matches the server markup
- **Tree-shakeable** — only pay for features you use
- **Tiny** — ~3KB gzipped

## Benchmarks

Reproduce with `npx vitest bench --run test/bench/render.bench.ts test/bench/getValues.bench.ts` (and `test/bench/scale.bench.ts` for the scale scenarios):

- Single-field change across 100 controlled fields: **96µs** vs RHF Controller 175µs (~**1.8×**), with exactly **1 re-render** for 100 fields
- `getValues` copy-on-write ownership merge: **2.16×** faster than re-copying branches per key
- Single-field change across 1000 controlled fields: **0.358ms** vs RHF Controller 1.465ms (**4.0×**), still exactly **1 re-render**
- Async validation storm — burst of 3 changes × 50 debounced async validators settled via `trigger`: **24.2ms**
- `await trigger(form)` — 100 mixed validators (50 sync + 50 async) settle: **1.49ms**
