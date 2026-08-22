---
sidebar_position: 2
---

# Comparison

react-f0rm vs the established options. react-f0rm figures come from this repo (size-limit, tinybench — see [Introduction](./intro.md#benchmarks)); competitor sizes are Bundlephobia gzip observations and drift between versions, so treat them as ballpark rather than gospel.

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

## Which one should you use?

**Pick react-f0rm** when you want controlled components with true per-field subscriptions (design systems, editor-like forms), one Standard Schema adapter instead of a package per validator, compile-time-checked paths, and a small core (11.18 KB gzip / 7.1 KB brotli) — and you are comfortable with a young 0.x library.

**Pick React Hook Form** when uncontrolled inputs are an option: its raw `register` performs no per-field re-render at all and floors at 21µs/change vs our 113µs (see [Introduction](./intro.md#benchmarks)) — uncontrolled is simply a cheaper rendering model. RHF is also the right call when you need its mature ecosystem of resolvers, UI-library integrations and community answers today. TanStack Form sits in between: choose it when the deepest possible type inference (including validator signatures) matters more to you than bundle size.

## Further reading

- [React Hook Form docs](https://react-hook-form.com)
- [TanStack Form docs](https://tanstack.com/form)
- [Formik on GitHub](https://github.com/jaredpalmer/formik) (maintenance-mode notice in the README)
