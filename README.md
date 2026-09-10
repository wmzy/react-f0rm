# react-f0rm

[![CI](https://github.com/wmzy/react-f0rm/actions/workflows/ci.yml/badge.svg)](https://github.com/wmzy/react-f0rm/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/react-f0rm)](https://www.npmjs.com/package/react-f0rm)
[![bundle size](https://img.shields.io/badge/bundlephobia/minzip/react-f0rm)](https://bundlephobia.com/package/react-f0rm)
[![License: ISC](https://img.shields.io/npm/l/react-f0rm)](https://opensource.org/licenses/ISC)

A headless, event-driven React form library with field-level subscriptions.

**The pitch in one sentence:** a lighter, faster TanStack Form — same field-level-subscription model and headless API, ~25% smaller core, 2.4× faster controlled-field changes — plus react-hook-form's escape hatches (`register` at `{...register('x')}` parity, `uncontrolled` mode, declarative `rules`, nested `formState.errors`-style error reads) and one Standard Schema adapter for every validation library.

- [Docs site](https://wmzy.github.io/react-f0rm/) — guides, API reference, migration
- [Benchmarks](https://wmzy.github.io/react-f0rm/benchmarks) · [Comparison](https://wmzy.github.io/react-f0rm/comparison) · [Storybook gallery](https://wmzy.github.io/react-f0rm/storybook)
- Coming from TanStack Form? [Migrating from TanStack Form](./docs/from-tanstack-form.md) is the one-page concept map.

## Features

- **Field-level subscriptions.** Editing one field re-renders exactly that field's component. State is read through React's native `useSyncExternalStore` — tearing-safe under concurrent rendering. `uncontrolled: true` drops the value subscription entirely (react-hook-form `register` model: typing re-renders nothing, bench parity at ~12µs/change).
- **One shared runtime dependency.** The event core is a facade over `@for-fun/event-emitter` (external in ESM/CJS, so apps sharing it dedupe the copy; inlined only in the UMD bundle). The tradeoff is recorded in [ADR-0001](./docs/decisions/0001-event-emitter-facade.md).
- **Compile-time-checked paths.** `FieldPath<T>` / `PathValue<T, P>`: typo'd field names fail at compile time on the generic APIs; `FieldErrors<T>` types the error record; an `OpaqueTypes` registry stops recursion into Date/Dayjs-style leaves. See the [TypeScript guide](https://wmzy.github.io/react-f0rm/guides/typescript).
- **One schema adapter for every library.** Standard Schema v1 covers zod v3.24+/v4, valibot v1, arktype and more — plus `createForm({validate: schema})` accepts a schema directly and infers `TValues` from its output. See [Validation](https://wmzy.github.io/react-f0rm/guides/validation).
- **Async validation with cancellation.** `validateDebounce` per field + an `AbortSignal` in every validator's meta — superseded rounds cancel their in-flight work; pending debounce counts as validating so submit waits; `asyncAlways` lands a gate's verdict and the validator's result per-source.
- **Multiple errors per field.** Every field holds an ordered `FieldError[]`; resolvers forward every schema issue.
- **Headless everywhere.** You own the markup — `useField`/`handleSubmit`/`subscribe`/`watch` work without the DOM (React Native included); `Field`/`Checkbox`/`Select`/`Form` are thin DOM adapters over the same hooks. See [Headless & React Native](https://wmzy.github.io/react-f0rm/guides/headless-react-native).
- **Selector primitive.** `useStore(form, selector, isEqual?)` is the TanStack `useStore` counterpart; `useValues(form)` watches the whole tree (RHF `watch()` with no arguments); `useWatch` with the `isEqual` bailout covers single events; `useFormState` is the built-in aggregate. See [Hooks Reference](https://wmzy.github.io/react-f0rm/guides/hooks-reference).
- **React 19 / Server Actions.** `<Form action>` dispatches validated, schema-coerced values as `FormData`; an action returning `{errors: {field: msg}}` hydrates the fields as server errors; `react-f0rm/server` re-validates payloads without React and parses incoming FormData back with `valuesFromFormData`. See the [Server Actions guide](https://wmzy.github.io/react-f0rm/guides/react19-server-actions).
- **Accessibility wired in.** `aria-invalid` + `aria-describedby` → `fieldErrorId(name)` on every bound field; `renderError` completes the `role="alert"` chain.
- **`form.register(name)`** — react-hook-form's `register` contract, no hook required: spread the returned props onto an uncontrolled element (`<input {...form.register('email')} />`), the element never re-renders, and the store still carries every write (`getValues`/submit/validation read it). Works in dynamic lists, conditional fields and non-React adapters; `rules`/`mode`/`valueAsNumber` ride the same pipeline `useField` uses. `useField({uncontrolled: true})` stays the hook-side counterpart.
- **Spreadable `inputProps`.** `<input {...field.inputProps} />` binds value, event extraction (`eventToValue`/`valueAsNumber`/checkbox/file auto-detection), blur, the focus channel, `disabled` and the `aria-invalid`/`aria-describedby` chain in one spread — while the headless `onChange(value)` keeps serving design-system controls that hand raw values.
- **Nested error tree.** `useErrorsTree(form)` / `getErrorsTree(form)` read errors as `errors.items?.[0]?.name` — the typed optional-chain shape RHF's `formState.errors` uses — alongside the flat dotted record (`useErrors`). One cache, both views, stable references.
- **Form-level validation cadence.** `createForm({validateMode: 'onChange' | 'onBlur'})` re-runs the form-level `validate` on every user change/blur — TanStack `validators.onChange/onBlur` parity without enumerating `validateDeps`; rounds own their errors, so a passing re-run clears what the last round wrote.
- **Disabled subtrees.** A field declared `disabled: true` disables its descendants (RHF subtree semantics); a descendant opts back out with `disabled: false`. The form-level flag still disables everything.
- **Tombstone unregister, async initial values, declarative `rules`** (store-side errors + native constraint attributes), `validateOnMount`, `validateDeps` cross-field re-runs, `useTransform` async transforms, `createFormContext` typed isolated contexts, `reset`/`resetField` with RHF-parity keep-flags, `<Devtools />` from `react-f0rm/devtools`, `react-f0rm/persist` — see the [docs site](https://wmzy.github.io/react-f0rm/) for the full surface.
- **14.33 KB gzip core** (13.0 KB brotli, emitter-external measurement); devtools/server/persist/resolvers ship as separate tree-shakeable entries.

## Install

Requires React 18 or newer (native `useSyncExternalStore`, no shim).

```sh
npm i react-f0rm
```

## Quick Start

```jsx
import React from 'react';
import {Form, Field} from 'react-f0rm';

export default function Register() {
  return (
    <Form
      initialValues={{name: '', email: ''}}
      onValidSubmit={values => console.log(values)}
    >
      <Field name="name" rules={{required: true}} renderError={e => <em>{e}</em>} />
      <Field name="email" type="email" />
      <button>SUBMIT</button>
    </Form>
  );
}
```

Headless — the same form without `<Field>`'s DOM:

```jsx
import {useField} from 'react-f0rm';

function CustomField({name}) {
  const {value, onChange, onBlur, error, focusRef} = useField({name});
  return (
    <div>
      <input ref={focusRef} value={value ?? ''} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
```

Or one spread — `inputProps` is the DOM-boundary adapter over the same handlers (event extraction, focus channel, a11y chain included):

```jsx
function CustomField({name}) {
  const {inputProps, error} = useField({name});
  return (
    <div>
      <input {...inputProps} />
      {error && <span role="alert" id={fieldErrorId(name)}>{error}</span>}
    </div>
  );
}
```

Or no hook at all — `form.register` is RHF's `register` contract (the element never re-renders; live state through `useValue`/`useError`):

```jsx
function DynamicFields({form}) {
  return form.fields.map(name => (
    <div key={name}>
      <input {...form.register(name)} />
      <FieldError name={name} />
    </div>
  ));
}
```

Schemas go straight into `validate`:

```jsx
import {z} from 'zod';

const form = useForm({
  initialValues: {email: '', password: ''},
  validate: z.object({
    email: z.string().email(),
    password: z.string().min(8)
  }) // no resolver import; TValues infers from the schema
});
```

Try the components without writing an app: `npm run storybook` (this repo) serves the Storybook gallery — every bound component, rules, field arrays, devtools and the uncontrolled mode are live-editable there. The [docs site](https://wmzy.github.io/react-f0rm/) carries the full guides.

## Benchmarks

tinybench, run on a desktop-class machine (AMD Ryzen 7 8745HS). Measured rme varies by run — the µs means wobble between runs and under load, so treat them as one significant figure (collected 2026-09: two render runs 130µs/138µs for f0rm vs 128µs/124µs for RHF `Controller` — the 100-field controlled row flip-flops inside noise).

| Scenario | react-f0rm | Baseline | Speedup |
|---|---|---|---|
| Change one of 100 controlled fields | 138µs/change (~7,500 ops/s) | RHF `Controller`: 124µs (~8,200 ops/s) | parity (± noise; the row flips run to run) |
| Change one of 100 controlled fields | 138µs/change (~7,500 ops/s) | TanStack `form.Field`: 335µs (~3,000 ops/s) | ~2.4× |
| Components re-rendered per change | 1 of 100 `Field`s | — | — |
| Change one of 100 uncontrolled fields | 12.5µs/change (~80,700 ops/s) | RHF `register`: 11.7µs (~86,200 ops/s) | parity (~7% apart) |
| `getValues()`, 100 fields × depth 3 (cold compute; DEV snapshot guard on both paths) | 55.9µs (ownership merge) | legacy chained `set`: 95.9µs | 1.7× |
| Change one of 1000 controlled fields | 0.652ms/change (~1,550 ops/s) | RHF `Controller`: 1.22ms (~840 ops/s) | ~1.9× |
| Async validation storm — burst of 3 changes × 50 debounced async validators, settled via `trigger` | 21.4ms/burst (~47 ops/s) | — | — |
| `await trigger(form)` — 100 mixed validators (50 sync + 50 async) settle | 5.33ms (~196 ops/s) | — | — |

Notes:

- The uncontrolled row is the apples-to-apples `register` comparison: react-f0rm's `uncontrolled: true` runs at RHF-`register` parity while keeping errors/touched/disabled/validating reactive, which raw `register` does not. The controlled comparison uses `Controller`, RHF's per-field-subscribed counterpart, and `form.Field` is TanStack's same-model counterpart.
- The 100-field controlled row is genuinely within noise of parity (two runs landed on opposite sides); the 1000-field row is the reliable separation — field-level subscriptions scale better than `Controller`'s per-change work.

Reproduce with:

```sh
npx vitest bench --run test/bench/render.bench.ts test/bench/getValues.bench.ts
npx vitest bench --run test/bench/scale.bench.ts   # the three scale scenarios above
```

## Comparison

react-f0rm vs React Hook Form, TanStack Form and Formik — rendering model, schema adapters, path typing, async validation, bundle size, ecosystem maturity — lives on the [Comparison page](https://wmzy.github.io/react-f0rm/comparison) of the docs site.

Short version: **pick react-f0rm** for controlled components with true per-field subscriptions (design systems, editor-like forms), one Standard Schema adapter, compile-time-checked paths, `register`-style bindings when you want them, and a core at RHF's size — and you are comfortable with a young library. **Pick React Hook Form** for the mature ecosystem today (its performance edge is gone at the rendering level — see the bench notes). **TanStack Form** sits in between: the deepest possible type inference, at a larger core.

## Docs Map

- Guides: [Validation](https://wmzy.github.io/react-f0rm/guides/validation) · [Field Arrays](https://wmzy.github.io/react-f0rm/guides/field-arrays) · [Submission](https://wmzy.github.io/react-f0rm/guides/submission) · [Sub-forms](https://wmzy.github.io/react-f0rm/guides/sub-forms) · [React 19 Server Actions](https://wmzy.github.io/react-f0rm/guides/react19-server-actions) · [SSR](https://wmzy.github.io/react-f0rm/guides/ssr) · [TypeScript](https://wmzy.github.io/react-f0rm/guides/typescript) · [Custom components](https://wmzy.github.io/react-f0rm/guides/custom-components) · [UI-kit integration](https://wmzy.github.io/react-f0rm/guides/ui-integration) · [Testing](https://wmzy.github.io/react-f0rm/guides/testing) · [Hooks Reference](https://wmzy.github.io/react-f0rm/guides/hooks-reference) · [Headless & React Native](https://wmzy.github.io/react-f0rm/guides/headless-react-native)
- Examples: [Basic](https://wmzy.github.io/react-f0rm/examples/basic) · [Dynamic fields](https://wmzy.github.io/react-f0rm/examples/dynamic) · [Real-world form](https://wmzy.github.io/react-f0rm/examples/real-world-form) (wizard + cross-field validation + server backfill)
- Migration: [from Formik](https://wmzy.github.io/react-f0rm/migration/from-formik) · [from React Hook Form](https://wmzy.github.io/react-f0rm/migration/from-react-hook-form) · [from TanStack Form](https://wmzy.github.io/react-f0rm/migration/from-tanstack-form) · [Breaking changes](https://wmzy.github.io/react-f0rm/migration/breaking-changes)

## Development

```bash
npm test              # 858 tests, vmThreads pool (~3s)
npm run test:watch    # watch mode
npm run coverage      # coverage report (95/90/95/95 thresholds enforced)
npx vitest bench --run test/bench/  # benchmarks
npm run bench:report              # bench suite -> docs-site/docs/benchmarks.md
npm run build         # production build (UMD + ESM + CJS)
npm run lint          # ESLint
npm run storybook     # Storybook dev server
npm run docs:build    # Docusaurus build (docs-site/)
```

## License

ISC
