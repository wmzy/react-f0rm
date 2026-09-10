---
sidebar_position: 1
---

# Introduction

react-f0rm is a lightweight, event-driven React form library with fine-grained subscriptions and refined tree-shaking support.

## Features

- **Field-level subscriptions** — each field subscribes to exactly its own state. Typing into one of 100 controlled fields triggers precisely **1 re-render**; a single-field change measures **0.121ms vs 0.129ms** for React Hook Form's Controller, with a much lower tail (p999 0.445ms vs 1.047ms)
- **Uncontrolled escape hatch** — `useField({uncontrolled})` / `<Field uncontrolled />` drop the per-keystroke re-render entirely (RHF `register`-style; the store still carries every write, errors/touched still re-render the field)
- **`useFormState` aggregate** — one subscription, one snapshot: `isDirty`/`dirtyFields`/`isTouched`/`touchedFields`/`hasErrors`/`isValid`/`isSubmitting`/`isValidating`/`isSubmitSuccessful`/`submitCount`/`disabled`, reference-stable while nothing changed
- **Event-driven** — efficient updates via an event emitter, powered by `useSyncExternalStore` (no tearing under concurrent rendering)
- **Type-safe paths** — `FieldPath<T>` / `PathValue<T, P>` turn a typo'd field path into a compile error, with the value type resolved at each path
- **Standard Schema support** — one adapter (`react-f0rm/resolvers/standard-schema`) covers zod v3.24+/v4, valibot v1, arktype and every other spec implementer, at field or form level; Zod and Yup resolvers included
- **Accessible by default** — `aria-invalid` on errored inputs plus `aria-describedby` → `fieldErrorId(name)` wiring on every bound field (`Field`/`Checkbox`/`Select`), optional `renderError` with `role='alert'`, native constraint bubbles via `checkValidity`/`reportValidity`, and `setServerErrors(form, apiErrors)` for landing 422 responses field by field
- **Multiple errors per field** — every field holds an ordered `FieldError[]`; schema resolvers forward every issue instead of stopping at the first
- **Async validation with cancellation** — `validateDebounce` per field plus an `AbortSignal` in the validator meta; `trigger` resolves `Promise<boolean>` once validation settles
- **Headless everywhere** — `<FormField>` render prop for non-hook consumers (class components, library bridges), `createFormContext<Values>()` for typed per-app contexts, file inputs bind one-way without a `value` prop
- **React 19 Server Actions** — `<Form action>` dispatches the validated, schema-coerced values as `FormData` (`formDataFromValues` from `react-f0rm/server` builds it, files and arrays included); `react-f0rm/server` validates payloads without React
- **Persistence plugin** — `react-f0rm/persist` hydrates and re-writes a form snapshot to localStorage (or any storage adapter) through `subscribe`
- **Precise lifecycle control** — `reset(form, values, {keepDirtyValues, keepValues, keepDefaultValues, …})`, `removeField` keep-flags, `trigger(…, {shouldFocus})`, `setFocus(form, name)`
- **Schemas straight into `validate`** — `createForm({validate: schema})` / `useField({validate: schema})` accept a Standard Schema v1 object directly, and the form-level variant infers `TValues` from the schema's output (`InferSchemaValues` exported for separate declarations)
- **Server errors land themselves** — a `<Form action>` / `handleSubmit({onAction})` callback returning `{errors: {field: msg}}` hydrates the fields as `type: 'server'` errors; retries are judged fresh, never vetoed by a stale verdict
- **Progressive enhancement** — a URL string in `<Form action>` renders as the native `action` attribute: no-JS browsers post raw FormData, the JS path runs the validated pipeline
- **Headless `watch(form, …)`** — the framework-free counterpart of `useWatch`: a tree-shakeable named export returning a subscribe/getSnapshot handle for Solid/Vue/Svelte adapters and imperative code
- **Async transforms** — `useTransform`'s `fromDisplay` may return a Promise, `asyncDebounceMs` debounces the commit (latest write wins, stale resolutions dropped)
- **SSR out of the box** — `renderToString` renders initial values; hydration matches the server markup
- **Tree-shakeable** — only pay for features you use
- **Tiny\*\* — 12.9 KB gzipped (11.7 KB brotli), shipped minified; `devtools`/`server`/`persist`/resolvers are separate entries

## Benchmarks

Reproduce with `npx vitest bench --run test/bench/render.bench.ts test/bench/getValues.bench.ts test/bench/scale.bench.ts` (vitest 5's bench fixture; same machine, same run for every pair, rme < 5%):

- Single-field change across 100 controlled fields: **0.121ms** vs RHF Controller 0.129ms (on par, ~6% faster; p999 0.445ms vs 1.047ms — a 2.4× lower tail), with exactly **1 re-render** for 100 fields; RHF's uncontrolled `register` floors at 0.0118ms (~10× cheaper — the uncontrolled rendering model's edge)
- `getValues` copy-on-write ownership merge: **~1,159×** faster than chained per-key sets (memoized between writes)
- Single-field change across 1000 controlled fields: **0.572ms** vs RHF Controller 1.124ms (**2.0×**), still exactly **1 re-render** for 1000 fields (asserted inline by the bench)
- Async validation storm — burst of 3 changes × 50 debounced async validators, coalesced to exactly 1 run per field (asserted inline), burst + settle: **31.7ms**
- `await trigger(form)` — 100 mixed validators (50 sync + 50 async) settle: **1.13ms**

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
| React 19 / Server Actions | `<Form action>` prop dispatches the validated, schema-coerced values as `FormData` (`formDataFromValues` exported from `react-f0rm/server` — files, arrays, nested objects included); `validateValues` validates payloads server-side without React; no submit before JS loads | `<Form>` accepts a function `action` prop (server-action-style submit) since v7.84, and ships a `react-server` export | Documented server action integration (`createServerValidate` for server-side validation, Next.js examples) | — |
| Bundle size | 12.88 KB gzip core (11.72 KB brotli), emitter-external measurement, one shared runtime dependency (`@for-fun/event-emitter`, deduped when your app already depends on it) | 14.06 KB gzip (bundlephobia, v7.87.0, 2026-09) | 19.02 KB gzip (v1.33.5, local measurement with runtime deps bundled) | ~12.8 KB gzip |
| Devtools | `<Devtools />` from `react-f0rm/devtools` — separate entry point, tree-shakeable, never lands in the main bundle | `@hookform/devtools` (separate package) | Built-in devtools panel | None (official) |
| Ecosystem maturity | Young 1.x — small audience, few integrations so far | Most mature: massive adoption, resolvers, UI-kit integrations, abundant examples and answers | Backed by the TanStack family, actively growing | Maintenance mode; the author recommends considering RHF or Final Form for new projects |

Bundle-size basis: every column is gzip. react-f0rm is measured on the local build — size-limit's esbuild minification + tree-shaking of the shipped `dist/index.mjs` lands at 12.88 KB gzip / 11.72 KB brotli with the emitter marked external (it is a runtime dependency, not bundled; ~0.1 KB gzip more when actually bundled, +0 when your app already depends on it). Competitor figures are Bundlephobia observations of minified+gzip bundles — so ours is the conservative number, not the flattering one.
