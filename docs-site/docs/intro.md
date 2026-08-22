---
sidebar_position: 1
---

# Introduction

react-f0rm is a lightweight, event-driven React form library with fine-grained subscriptions and refined tree-shaking support.

## Features

- **Field-level subscriptions** — each field subscribes to exactly its own state. Typing into one of 100 controlled fields triggers precisely **1 re-render**; a single-field change measures **113µs vs 200µs** for React Hook Form's Controller (~1.8× faster)
- **Event-driven** — efficient updates via an event emitter, powered by `useSyncExternalStore` (no tearing under concurrent rendering)
- **Type-safe paths** — `FieldPath<T>` / `PathValue<T, P>` turn a typo'd field path into a compile error, with the value type resolved at each path
- **Standard Schema support** — one adapter (`react-f0rm/resolvers/standard-schema`) covers zod v3.24+/v4, valibot v1, arktype and every other spec implementer, at field or form level; Zod and Yup resolvers included
- **Accessible by default** — `aria-invalid` on errored inputs, optional `renderError` with `role='alert'` and automatic `aria-describedby` wiring, native constraint bubbles via `checkValidity`/`reportValidity`
- **Multiple errors per field** — every field holds an ordered `FieldError[]`; schema resolvers forward every issue instead of stopping at the first
- **Async validation with cancellation** — `validateDebounce` per field plus an `AbortSignal` in the validator meta; `trigger` resolves `Promise<boolean>` once validation settles
- **Precise lifecycle control** — `reset(form, values, {keepDirtyValues, …})`, `setFocus(form, name)`, typed per-app contexts via `createFormContext<Values>()`
- **SSR out of the box** — `renderToString` renders initial values; hydration matches the server markup
- **Tree-shakeable** — only pay for features you use
- **Tiny** — 11.18 KB gzipped (7.1 KB brotli minified)

## Benchmarks

Reproduce with `npx vitest bench --run test/bench/render.bench.ts test/bench/getValues.bench.ts` (and `test/bench/scale.bench.ts` for the scale scenarios):

- Single-field change across 100 controlled fields: **113µs** vs RHF Controller 200µs (~**1.8×**), with exactly **1 re-render** for 100 fields
- `getValues` copy-on-write ownership merge: **2.19×** faster than re-copying branches per key
- Single-field change across 1000 controlled fields: **0.418ms** vs RHF Controller 1.662ms (**4.0×**), still exactly **1 re-render**
- Async validation storm — burst of 3 changes × 50 debounced async validators settled via `trigger`: **20.5ms**
- `await trigger(form)` — 100 mixed validators (50 sync + 50 async) settle: **1.48ms**

## Comparison

How react-f0rm stacks up against the established options — [Comparison](./comparison.md) has the full walkthrough and further reading.

| | react-f0rm | React Hook Form | TanStack Form | Formik |
|---|---|---|---|---|
| Rendering model | Controlled fields with field-level subscriptions (`useSyncExternalStore`): editing one of 100 fields re-renders exactly 1 component | Uncontrolled `register` by default (no React re-render while typing); `Controller` opts into per-field re-renders | Field-level subscriptions (`form.Field` / `useField`), each field re-renders itself | Form-wide context: any state change re-renders all subscribed components |
| Unregister on unmount | Unregisters by default — an unmounted field drops out of `getValues()` (tombstone) instead of silently reviving its initial value; `shouldUnregister: false` keeps it | Value kept by default (`shouldUnregister` defaults to `false`); opt in per field or form to unregister on unmount | Values live in the form store; unmounting a field's UI keeps its value and state | No unregister concept — values persist until `reset` |
| Schema adapters | One Standard Schema entry point (`react-f0rm/resolvers/standard-schema`) covers zod, valibot, arktype, …; legacy zod/yup resolvers also shipped | `@hookform/resolvers` — one adapter module per validation library | Built-in `standardSchemaValidators` (Standard Schema v1), plus per-library adapter packages | Yup built in via `validationSchema`; other libraries hand-wired in `validate` |
| Path type safety | `FieldPath<T>` / `PathValue<T, P>`: every valid path enumerated, value type resolved, typos fail at compile time | `Path<T>` / `FieldPath` type-level path checking | Deep inference, including validator argument types — the strongest of the four | Top-level `keyof` only; nested paths are untyped strings |
| Async validation | `validateDebounce` per field + `meta.signal` (`AbortSignal`) handed to every validator — superseded rounds cancel their in-flight work; pending debounce counts as validating so submit waits | Async validators supported, but no built-in debounce and no cancellation signal — both are hand-rolled per project | Built in: `asyncDebounceMs` debounces and the validator meta carries an `AbortSignal` | Async `validate` supported; no debounce, no signal |
| Multiple errors per field | Native: every field holds `FieldError[]`; `getFieldErrors`/`useFieldErrors` read them; resolvers forward every schema issue | `criteriaMode: 'all'` collects all failing rules per field | Errors are arrays of messages per field | — |
| SSR / hydration | `renderToString` renders initial values out of the box; server snapshot matches the client's first render | SSR-safe | SSR-safe | SSR-safe |
| React 19 / Server Actions | Bridge pattern: dispatch the action from `onValidSubmit` via `startTransition`/`useActionState`, passing the values object rather than FormData (see the React 19 Server Actions guide); no submit before JS loads | `<Form>` accepts a function `action` prop (server-action-style submit) since v7.84, and ships a `react-server` export | Documented server action integration (`createServerValidate` for server-side validation, Next.js examples) | — |
| Bundle size | 11.18 KB gzip (7.1 KB brotli, minified), full core | ~11 KB gzip | ~17.5 KB gzip | ~12.8 KB gzip |
| Devtools | `<Devtools />` from `react-f0rm/devtools` — separate entry point, tree-shakeable, never lands in the main bundle | `@hookform/devtools` (separate package) | Built-in devtools panel | None (official) |
| Ecosystem maturity | New, 0.x — small audience, few integrations so far | Most mature: massive adoption, resolvers, UI-kit integrations, abundant examples and answers | Backed by the TanStack family, actively growing | Maintenance mode; the author recommends considering RHF or Final Form for new projects |

Bundle-size basis: every column is gzip. react-f0rm is measured on the local build — gzip of the shipped, unminified `dist/index.mjs` after `npm run build` (minified, the same file gzips to ~7.88 KB; 7.1 KB brotli via size-limit, which minifies and tree-shakes). Competitor figures are Bundlephobia observations of minified+gzip bundles — so ours is the conservative number, not the flattering one.
