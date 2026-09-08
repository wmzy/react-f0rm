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
| React 19 / Server Actions | `<Form action>` prop dispatches the validated, schema-coerced values as `FormData` (`formDataFromValues` exported from `react-f0rm/server` — files, arrays, nested objects included); `validateValues` validates payloads server-side without React; the `useActionState` bridge pattern is documented too; no submit before JS loads | `<Form>` accepts a function `action` prop (server-action-style submit) since v7.84, and ships a `react-server` export | Documented server action integration (`createServerValidate` for server-side validation, Next.js examples) | — |
| Bundle size | 10.78 KB gzip (9.83 KB brotli), shipped minified, full core, zero runtime dependencies | 14.06 KB gzip (bundlephobia, v7.87.0, 2026-09) | 19.02 KB gzip (v1.33.5, local measurement with runtime deps bundled) | ~12.8 KB gzip |
| Devtools | `<Devtools />` from `react-f0rm/devtools` — separate entry point, tree-shakeable, never lands in the main bundle | `@hookform/devtools` (separate package) | Built-in devtools panel | None (official) |
| Ecosystem maturity | Young 1.x — small audience, few integrations so far | Most mature: massive adoption, resolvers, UI-kit integrations, abundant examples and answers | Backed by the TanStack family, actively growing | Maintenance mode; the author recommends considering RHF or Final Form for new projects |

Bundle-size basis: every column is gzip. react-f0rm is measured on the local build — gzip of the shipped, terser-minified `dist/index.mjs` after `npm run build` (11.8 KB); size-limit's esbuild minification + tree-shaking lands at 11.6 KB gzip / 10.5 KB brotli. Competitor figures are Bundlephobia observations of minified+gzip bundles — so ours is the conservative number, not the flattering one.

## Which one should you use?

**Pick react-f0rm** when you want controlled components with true per-field subscriptions (design systems, editor-like forms), one Standard Schema adapter instead of a package per validator, compile-time-checked paths, built-in debounce/cancellation for async validation, an uncontrolled mode when you need the register-style no-rerender path, and a small core (11.8 KB gzip / 10.5 KB brotli) — and you are comfortable with a young 1.x library.

**Pick React Hook Form** when uncontrolled inputs are the default for your team: its raw `register` performs no per-field re-render at all and floors at 12µs/change vs our controlled 121µs (react-f0rm's `uncontrolled` mode matches the no-rerender model, but reset/initialValues do not sync into the DOM there yet). RHF is also the right call when you need its mature ecosystem of resolvers, UI-library integrations and community answers today. TanStack Form sits in between: choose it when the deepest possible type inference (including validator signatures) matters more to you than bundle size.

## Further reading

- [React Hook Form docs](https://react-hook-form.com)
- [TanStack Form docs](https://tanstack.com/form)
- [Formik on GitHub](https://github.com/jaredpalmer/formik) (maintenance-mode notice in the README)
- Migration guides: [from Formik](./migration/from-formik.md), [from React Hook Form](./migration/from-react-hook-form.md), [from TanStack Form](./migration/from-tanstack-form.md)
