---
sidebar_position: 1
---

# Introduction

react-f0rm is a lightweight, event-driven React form library with fine-grained subscriptions and refined tree-shaking support.

## Features

- **Field-level subscriptions** — each field subscribes to exactly its own state. Typing into one of 100 controlled fields triggers precisely **1 re-render**; a single-field change measures **110µs vs 177µs** for React Hook Form's Controller (~1.6× faster)
- **Event-driven** — efficient updates via an event emitter, powered by `useSyncExternalStore` (no tearing under concurrent rendering)
- **Type-safe paths** — `FieldPath<T>` / `PathValue<T, P>` turn a typo'd field path into a compile error, with the value type resolved at each path
- **Standard Schema support** — one adapter (`react-f0rm/resolvers/standard-schema`) covers zod v3.24+/v4, valibot v1, arktype and every other spec implementer, at field or form level; Zod and Yup resolvers included
- **Accessible by default** — `aria-invalid` on errored inputs, optional `renderError` with `role='alert'` and automatic `aria-describedby` wiring, native constraint bubbles via `checkValidity`/`reportValidity`
- **Tree-shakeable** — only pay for features you use
- **Tiny** — ~3KB gzipped

## Benchmarks

Reproduce with `npx vitest bench --run test/bench/`:

- Single-field change across 100 controlled fields: **110µs** vs RHF Controller 177µs (~**1.6×**), with exactly **1 re-render** for 100 fields
- `getValues` copy-on-write ownership merge: **2.12×** faster than re-copying branches per key
