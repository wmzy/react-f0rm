# react-f0rm

[![CI](https://github.com/wmzy/react-f0rm/actions/workflows/ci.yml/badge.svg)](https://github.com/wmzy/react-f0rm/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/react-f0rm)](https://www.npmjs.com/package/react-f0rm)
[![bundle size](https://img.shields.io/badge/bundlephobia/minzip/react-f0rm)](https://bundlephobia.com/package/react-f0rm)
[![License: ISC](https://img.shields.io/npm/l/react-f0rm)](https://opensource.org/licenses/ISC)

A headless, event-driven React form library with field-level subscriptions.

**The pitch in one sentence:** a lighter, faster TanStack Form — same field-level-subscription model and headless API, ~33% smaller core, 2.4× faster controlled-field changes — plus react-hook-form's escape hatches (`uncontrolled` mode at `register` parity, declarative `rules`) and one Standard Schema adapter for every validation library. [Benchmarks](https://wmzy.github.io/react-f0rm/benchmarks) · [Comparison](./docs-site/docs/comparison.md).

Coming from TanStack Form? [Migrating from TanStack Form](./docs/from-tanstack-form.md) is the one-page concept map — the core mapping table, known differences, and common pitfalls.

## Features

- **Field-level subscriptions.** Editing one field re-renders exactly that field's component, not the whole form. State is read through React's native `useSyncExternalStore`, so snapshots stay consistent under concurrent rendering (no tearing).
- **One shared runtime dependency.** The event core is `@for-fun/event-emitter` (a base library by the same author, ~2.3 KB gzip standalone) kept **external** in the ESM/CJS builds — an app that already depends on it dedupes the copy, and the emitted `Form.emitter` handle interops with the package's own `on()`/`emit()` types. `useSyncExternalStore` comes from React itself — the peer range is `react >=18`.

  Why external instead of inlined? The decision is a tradeoff worth stating plainly. Inlining (the UMD bundle does it — a `<script>` tag has no module graph) adds ~0.1 KB gzip and removes the dependency edge entirely; keeping the facade gains dedupe when the base package is already present and lets `Form.emitter` type-interoperate with its public API. The honest cost: the dependency is single-maintainer and low-adoption — a supply-chain and bus-factor risk. If that outweighs the interop for you, the escape hatch is real and small: the emitter surface is one file, and the event contract is the typed `FormEvents` table below.
- **Truly type-safe paths.** `FieldPath<T>` enumerates every valid field name for your values shape and `PathValue<T, P>` resolves the value type at that path — typos in field names fail at compile time on the generic APIs (`useField`, `setValue`, `getValue`, `useValue`, …), values are inferred.
- **One schema adapter for every library.** The Standard Schema resolver covers zod (v3.24+/v4), valibot v1, arktype and any other Standard Schema v1 implementation through a single tree-shakeable entry point.
- **Headless, with accessibility hooks.** You own the markup. When you opt into error rendering via `renderError`, `aria-invalid` and `aria-describedby` are wired up automatically.
- **Tombstone unregister.** Unmounted fields drop out of `getValues()` instead of silently reviving their initial values on the next read; `createForm({shouldUnregister: false})` flips the form-wide default to RHF's keep-the-value semantics.
- **Async initial values.** `initialValues` accepts a Promise or a thunk returning one — the form starts empty with `isLoading: true` (`useIsLoading`, `useFormState().isLoading`) and lands the resolved values as the baseline, react-hook-form's async `defaultValues` shape.
- **Copy-on-write `getValues()`.** An ownership-tracked merge allocates each container once per read instead of re-copying whole branches for every key. The result shares references across reads, so treat it as read-only — `structuredClone` the tree when you need a mutable copy. In development the snapshot is deep-frozen: mutating it throws at the offending line instead of silently corrupting the shared cache (production builds share baseline references unchanged).
- **Multiple errors per field.** Each field stores an ordered `FieldError[]` — `getFieldErrors`/`useFieldErrors` read them all, and schema resolvers forward every issue instead of stopping at the first.
- **Mount validation.** `createForm({validateOnMount: true})` (or per field) kicks every field's validator once after mount, so errors show on an untouched form; with an async `initialValues` source the kicks wait for the resolved baseline instead of validating the empty shell.
- **Form-level status channel.** `setStatus`/`useStatus` carry non-field state — server session flags, wizard steps, account-level errors — through the same event core (Formik's `status` role).
- **Async validation with cancellation.** `validateDebounce` per field — and on the form-level `validate` — plus an `AbortSignal` handed to every validator: a superseded round aborts its in-flight fetch, and pending debounce windows count as validating so submit waits them out. `asyncAlways` (field or form level) keeps a field's validator running even when its `required` gate failed, landing both verdicts per-source.
- **Declarative rules, native and store-side.** `rules` (`required`/`min`/`max`/`minLength`/`maxLength`/`pattern`/`validate` callbacks) compile into the store-based pipeline — queryable errors, your messages, `renderError`/`aria-invalid` — and the declarative subset renders as native constraint attributes (`required`, `minLength`, `pattern`, …) for `:invalid` styling and screen-reader hints. A user-passed attribute always wins over the derived one.
- **Precise lifecycle control.** `reset(form, values, {keepDirtyValues, …})` covers refetch-without-clobbering-dirty-drafts, `setFocus(form, name)` focuses programmatically, and `trigger(form, name?)` resolves `Promise<boolean>` once validation settles.
- **Typed, nestable form contexts.** `createFormContext<Values>()` gives each app area an isolated provider whose `useField`/`useFieldArray` take `FieldPath<Values>` names without hand-written generics.
- **Schemas straight into `validate`.** `createForm({validate: schema})` and `useField({validate: schema})` accept a Standard Schema v1 object directly — no resolver import — and the form-level variant **infers `TValues` from the schema's output** (TanStack `useForm({validators})` shape). `InferSchemaValues<typeof schema>` is exported for separate declarations; coerced outputs (zod transforms, `z.coerce.*`) land as the parsed baseline.
- **Server errors land themselves.** A `<Form action>` / `handleSubmit({onAction})` callback may return `{errors: {field: 'message'}}` — it hydrates the fields as per-field `type: 'server'` errors (Conform-style), marks the submit unsuccessful, and a retry is judged fresh (the previous round's server errors never veto it).
- **Progressive enhancement.** Pass a URL string to `<Form action>`: without JavaScript the browser posts raw FormData to it (native constraint attributes from `rules` still gate), with JavaScript the validated pipeline runs instead.
- **Headless `watch(form, …)`.** The framework-free counterpart of `useWatch` — a tree-shakeable named export returning a subscribe/getSnapshot handle (Solid/Vue/Svelte adapters, imperative autosave), with the same `isEqual` bailout contract.
- **Async transforms.** `useTransform`'s `fromDisplay` may return a Promise, with `asyncDebounceMs` debouncing the display→raw commit — latest write wins, stale resolutions dropped (TanStack `asyncDebounceMs` parity).
- **SSR out of the box.** `renderToString` renders initial values and the server snapshot matches the client's first render, so hydration is consistent.
- Event-driven core with refined tree-shaking — you don't pay for features you don't use.

## Install

Requires React 18 or newer (native `useSyncExternalStore`, no shim).

```sh
npm i react-f0rm
```
or
```
yarn add react-f0rm
```

Try the components without writing an app first: `npm run storybook` (this repo) serves the Storybook gallery — every bound component, rules, field arrays, devtools, and the uncontrolled mode are live-editable there. The [docs site](https://wmzy.github.io/react-f0rm/) carries the full guides (validation, sub-forms, server actions, UI-kit integration, migration from Formik/RHF/TanStack Form).

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

- The uncontrolled row is the apples-to-apples `register` comparison: react-f0rm's `uncontrolled: true` (no value subscription) runs at RHF-`register` parity — 12.5µs vs 11.7µs per change — while keeping errors/touched/disabled/validating reactive, which raw `register` does not. The controlled comparison uses `Controller`, RHF's per-field-subscribed controlled counterpart, and `form.Field` is TanStack's same-model counterpart: field-level subscriptions, ~2.4× the change cost.
- Both `getValues()` paths pay the DEV snapshot guard (`freezeValues`: clone + freeze), so the comparison isolates the merge strategy; in production neither side pays it. Ownership merging also cut container allocations from 300 to 111.
- The 100-field controlled row is genuinely within noise of parity (two runs landed on opposite sides); the 1000-field row is the reliable separation — field-level subscriptions scale better than `Controller`'s per-change work.

Reproduce with:

```sh
npx vitest bench --run test/bench/render.bench.ts test/bench/getValues.bench.ts
npx vitest bench --run test/bench/scale.bench.ts   # the three scale scenarios above
```

## Comparison

react-f0rm vs the established options. react-f0rm figures come from this repo (size-limit, tinybench — see [Benchmarks](#benchmarks)); competitor sizes are Bundlephobia gzip observations and drift between versions, so treat them as ballpark rather than gospel.

| | react-f0rm | React Hook Form | TanStack Form | Formik |
|---|---|---|---|---|
| Rendering model | Controlled fields with field-level subscriptions (`useSyncExternalStore`): editing one of 100 fields re-renders exactly 1 component; `uncontrolled: true` drops the value subscription and runs at RHF-`register` parity (12.3µs vs 12.1µs bench) while errors/touched/disabled stay reactive | Uncontrolled `register` by default (no React re-render while typing); `Controller` opts into per-field re-renders | Field-level subscriptions (`form.Field` / `useField`), each field re-renders itself — the same model, 3.2× the per-change cost (355µs vs 111µs bench) | Form-wide context: any state change re-renders all subscribed components |
| Unregister on unmount | Unregisters by default — an unmounted field drops out of `getValues()` (tombstone) instead of silently reviving its initial value; `shouldUnregister: false` per field or per form (`createForm({shouldUnregister: false})`) keeps it | Value kept by default (`shouldUnregister` defaults to `false`); opt in per field or form to unregister on unmount | Values live in the form store; unmounting a field's UI keeps its value and state | No unregister concept — values persist until `reset` |
| Schema adapters | One Standard Schema entry point (`react-f0rm/resolvers/standard-schema`) covers zod, valibot, arktype, …; legacy zod/yup resolvers also shipped | `@hookform/resolvers` — one adapter module per validation library | Built-in `standardSchemaValidators` (Standard Schema v1), plus per-library adapter packages | Yup built in via `validationSchema`; other libraries hand-wired in `validate` |
| Path type safety | `FieldPath<T>` / `PathValue<T, P>`: every valid path enumerated, value type resolved, typos fail at compile time on the generic APIs (`useField`, `setValue`, `getValue`, …), and the `validate` value argument is path-inferred on `useField`/`Field` (`PathValueOf<T, P>`) | `Path<T>` / `FieldPath` type-level path checking | Deep inference, including validator argument types — the strongest of the four | Top-level `keyof` only; nested paths are untyped strings |
| Async initial values | `initialValues: T \| Promise<T> \| () => T \| Promise<T>`: async sources start the form empty with `isLoading: true` (`useIsLoading` / `useFormState().isLoading`) and land the resolved values as the baseline | Async `defaultValues` supported (`formState.isLoading`) | `defaultValues: () => Promise<T>` supported | Not built in — resolve before rendering, or re-render after fetch |
| Async validation | `validateDebounce` per field + `meta.signal` (`AbortSignal`) handed to every validator — superseded rounds cancel their in-flight work; pending debounce counts as validating so submit waits; `asyncAlways` keeps the validator running when the `required` gate failed, landing both verdicts per-source | Async validators supported, but no built-in debounce and no cancellation signal — both are hand-rolled per project | Built in: `asyncDebounceMs` debounces, the validator meta carries an `AbortSignal`, `asyncAlways` runs async validation even when sync validation failed | Async `validate` supported; no debounce, no signal |
| Mount validation | `validateOnMount` form-level (`createForm` / `<Form>`) or per field — fields with a validator kick once after mount; deferred until an async `initialValues` source lands, validator-less fields never kick | — | `validateOnMount` per field | `validateOnMount` form-level |
| Multiple errors per field | Native: every field holds `FieldError[]`; `getFieldErrors`/`useFieldErrors` read them; resolvers forward every schema issue | `criteriaMode: 'all'` collects all failing rules per field | Errors are arrays of messages per field | — |
| Non-field metadata | `setStatus` / `useStatus` — one user-owned slot for session flags, step state, non-field errors (Formik's `status` role), event-driven | — | Form/field `meta` API | `status` |
| SSR / hydration | `renderToString` renders initial values out of the box; server snapshot matches the client's first render (async initialValues render empty + `isLoading` on both sides) | SSR-safe | SSR-safe | SSR-safe |
| React 19 / Server Actions | Function `action` prop on `<Form>`: after validation passes, the validated values are converted to FormData and dispatched to it (a Server Action or a `useActionState` bridge; `onSubmit`/`onValidSubmit` also receive the values object). The `react-f0rm/server` entry's `validateValues` re-validates payloads server-side. No native no-JS submit — deliberate (see the stance below) | `<Form>` accepts a function `action` prop (native server-action-style submit, works without JS) since v7.84, and ships a `react-server` export | Documented server action integration (`createServerValidate` for server-side validation, Next.js examples) | — |
| Bundle size | 12.78 KB gzip core (11.64 KB brotli; emitter-external measurement) + one shared dependency (`@for-fun/event-emitter`, ~2.3 KB gzip standalone, ~+0.1 KB gzip when actually bundled, +0 when your app already depends on it) | 14.06 KB gzip (bundlephobia, v7.87.0, 2026-09) | 19.02 KB gzip (v1.33.5 measured locally: minified + gzip, `@tanstack/form-core` and `react-store` bundled, react external — the bundlephobia methodology) | ~12.8 KB gzip |
| Devtools | `<Devtools />` from `react-f0rm/devtools` — separate entry point, tree-shakeable, never lands in the main bundle | `@hookform/devtools` (separate package) | Built-in devtools panel | None (official) |
| Ecosystem maturity | New — small audience, few integrations so far | Most mature: massive adoption, resolvers, UI-kit integrations, abundant examples and answers | Backed by the TanStack family, actively growing | Maintenance mode; the author recommends considering RHF or Final Form for new projects |

Bundle-size basis: every column is gzip. react-f0rm is measured on the local build — the shipped, minified `dist/index.mjs` gzips to 12.78 KB emitter-external (11.64 KB brotli; size-limit, which minifies and tree-shakes, reports the same file with the emitter marked external — it is a runtime dependency, not bundled: ~0.1 KB gzip more when a bundler inlines it, +0 when your app already depends on it). The RHF figure is a bundlephobia API observation of v7.87.0 (2026-09); the TanStack figure is a local measurement of v1.33.5 following the bundlephobia methodology (minified + gzip, its two runtime deps bundled, react external). Formik's is the historical bundlephobia ballpark. Ours is the conservative number — measured on the built artifact, not a promise.

### Which one should you use?

**Pick react-f0rm** when you want controlled components with true per-field subscriptions (design systems, editor-like forms), one Standard Schema adapter instead of a package per validator, compile-time-checked paths, and the smallest core of the four (12.78 KB minified gzip emitter-external / 11.64 KB brotli, one shared runtime dependency) — and you are comfortable with a young library.

**Pick React Hook Form** when you want the mature ecosystem — resolvers, UI-library integrations and community answers — today. Its performance edge is gone at the rendering level: raw `register` benches at 11.7µs/change and react-f0rm's `uncontrolled: true` at 12.5µs (parity, see [Benchmarks](#benchmarks)), the controlled model is within noise of `Controller` at 100 fields and ~1.9× ahead at 1000, and TanStack's `form.Field` costs ~2.4× our per-change time. TanStack Form sits in between: choose it when the deepest possible type inference matters more to you than bundle size and per-change cost — react-f0rm's `validate` value argument is now path-inferred on `useField`/`Field` too.

**Server Actions: the callback `action` prop, not the native one.** `<Form>` ships a function `action` prop — after validation passes, the validated values are converted to FormData (`formDataFromValues`) and dispatched to it, e.g. a React 19 Server Action or a `useActionState` bridge. What is deliberately **not on the roadmap** is native progressive enhancement (the browser submitting without JavaScript), a `react-server` entry point, and a TanStack-style `createServerValidate` helper — a stance, not a gap. react-f0rm's source of truth is the values store, not the DOM: a no-JS submit would ship FormData keyed by JSON-stringified path keys, drop every store-only value, and skip the validation gate entirely (the [React 19 Server Actions guide](docs-site/docs/guides/react19-server-actions.md) unpacks all four failure modes). The recommended shape is the bridge — pass `action` directly, or dispatch from `onValidSubmit` via `startTransition`/`useActionState`, passing the values object rather than FormData — which keeps validation gating the action and types/nesting intact. If submitting without JavaScript loaded is a hard requirement, RHF's native `action` prop support is the better fit today.

## Usage

```jsx
import React from 'react';
import {Form, Field} from 'react-f0rm';

export default function Register() {
  return (
    <Form
      initialValues={{name: 'wmzy', email: '1256573276@qq.com'}}
      onValidSubmit={values => console.log(values)}
    >
      <Field name="name" />
      <Field name="email" />
      <button>SUBMIT</button>
    </Form>
  );
}
```

## Hooks

### `useField`

For full control over field rendering:

```jsx
import {useField} from 'react-f0rm';

function CustomField({name}) {
  const {value, onChange, onBlur, error, errorObject, errors} = useField({name});
  return (
    <div>
      <input value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
```

`error` is the error's message string (or `undefined`); `errorObject` is the full structured error `{type, message}`. `errors` is every error registered for the field (`FieldError[]`, insertion order) — `error`/`errorObject` are its first entry (see [Multiple errors per field](#multiple-errors-per-field)). Pass an explicit `form` to use the hook outside a `<Form>`:

```jsx
const form = useForm({initialValues: {email: ''}});
const {value, onChange} = useField({form, name: 'email'});
```

The result also carries `focusRef` — a stable callback ref for the input element. `setFocus` and a failed submit's first-error auto-focus ([Focusing the first error](#focusing-the-first-error)) ride the `'focusError'` event, which reaches your element through this ref; leave it off and focus requests aimed at the field are silent no-ops. It only matters for headless callers building their own input — `<Field>` wires it internally, so its users never see it:

```jsx
const {value, onChange, focusRef} = useField({name: 'email'});
<input ref={focusRef} value={value} onChange={e => onChange(e.target.value)} />
```

`uncontrolled: true` pins the value at mount and skips the value subscription — typing re-renders nothing (the store still carries every write; errors/touched/disabled/validating still re-render the field), the react-hook-form `register` model at `register` parity (12.6µs vs 11.9µs bench). Bind the element with `defaultValue` instead of `value` — and attach `focusRef`, which doubles as the DOM-sync channel: bulk operations (`reset`, `setInitialValues`) write the store's value straight into the element (register-style, no render — exactly how RHF's reset clears uncontrolled inputs), while single-path writes (typing) are skipped. File inputs are exempt: their value cannot be assigned. `<Field uncontrolled />` wires all of this internally.

On unmount the field unregisters by default: its live value drops out of reads and `getValues()` (tombstone — no silent revival from `initialValues`). `shouldUnregister: false` keeps the value per field; `createForm({shouldUnregister: false})` or `<Form shouldUnregister={false}>` flips the form-wide default to react-hook-form's keep-the-value semantics, and a field-level option overrides the form-level flag in either direction.

### `subscribe`

Linked fields and other non-render side effects — province changed → clear city, autosave, analytics — should not require a mounted watching component. `subscribe` exposes the event core imperatively:

```jsx
import {createForm, subscribe, getValue, setValue} from 'react-f0rm';

const form = createForm({initialValues: {province: '', city: ''}});

const unsubscribe = subscribe(form, {
  name: 'province',
  callback: () => {
    // Read fresh state through the getters inside the callback.
    if (getValue(form, 'city')) setValue(form, 'city', '');
  }
});
```

| Option | Type | Default |
|---|---|---|
| `name` | field path, or an array of them | omitted — every emission of `event`, payload-less broadcasts (reset, …) included |
| `event` | `'change'` \| `'errors'` \| `'touched'` \| `'validating'` \| `'submitting'` \| `'submitCount'` \| `'submitSuccessful'` \| `'disabled'` | `'change'` |
| `scope` | `'leaf'` \| `'branch'` | `'branch'` |
| `callback` | `() => void`, fired with no arguments | required |

Matching follows the event's shape. `'change'` walks the path tree: the default `'branch'` scope wakes a `'tags'` subscriber when any `tags.*` descendant is written, while `'leaf'` matches only the exact key and its ancestors. `'validating'` carries a path per async validator round and narrows by path exactly like `'change'` — the imperative counterpart of a per-field validating indicator. `'errors'` and `'touched'` always match the exact key — another field's error never wakes this subscriber. `'submitting'`/`'submitCount'`/`'submitSuccessful'`/`'disabled'` are payload-less, so a `name` narrows nothing. An array of names creates one subscription per path, and the returned function unsubscribes them all. A number-bearing array (`['tags', 0]`) is one segments path, not a name list — the same rule `trigger` uses.

**`subscribe` vs `useWatch`:** `useWatch` (and the `useValue`/`useError`/… readers built on it) feeds rendering — it returns a snapshot and re-renders the component when it changes. `subscribe` runs imperative code and renders nothing. Use `subscribe` for linkages and effects; reach for a hook only when the watched value itself must appear on screen. Its first argument is the form (`useWatch(form, 'change', getter)`), matching every other hook's context shape; the raw emitter remains accepted for back-compat. `useWatch` itself takes an optional fourth argument — `isEqual(prev, next)` — aimed at wide-scope getters that return a fresh reference per call (a whole-values selector, say): on each event the getter recomputes, and an equal verdict keeps the cached snapshot without notifying React at all — no render, not even a bailed-out one (the same contract TanStack's `useSelector` `compare` option has).

### `useFieldArray`

Manage dynamic lists of fields:

```jsx
import {useFieldArray} from 'react-f0rm';

function Tags() {
  const {fields, append, remove} = useFieldArray({name: 'tags'});
  return (
    <div>
      {fields.map((field, index) => (
        <div key={field.id}>
          <Field name={['tags', index]} />
          <button type="button" onClick={() => remove(index)}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => append('')}>Add Tag</button>
    </div>
  );
}
```

The array only re-renders for changes touching its own branch — typing into unrelated fields does not re-render it.

**Path syntax:** array access is bracket-only — `items[0]`, `items[0].name`. Dotted numeric segments (`items.0`) throw a `TypeError` whose message shows the bracket spelling to use; a quoted segment (`items["0"]`) explicitly names a string key instead of an index. Segment arrays (`['items', 0]`) remain the fully dynamic form.

Besides the movers (`append`, `prepend`, `insert`, `remove`, `swap`, `move`), two bulk operations are available:

```jsx
const {fields, replace, update} = useFieldArray({name: 'tags'});

replace(['a', 'b', 'c']); // full swap: every row id is regenerated (length may change)
update(1, 'B');           // overwrite one value, keeping that row's id — no key churn
```

`replace(values)` is the refetch shape — a server response replaces the whole list — while `update(index, value)` rewrites a single row in place.

Three more options cover the react-hook-form `useFieldArray` surface:

```jsx
const {fields, append} = useFieldArray({
  name: 'tags',
  keyName: 'key',                              // expose the stable row id as field.key (default: 'id')
  rules: {required: true, minLength: 1, maxLength: 5}, // validated against the whole array
  shouldUnregister: false                      // keep the branch on unmount (default: form-level flag)
});

fields.map(field => <div key={field.key}>…</div>);
```

`rules` check the array itself — `required` fails on an empty array, `minLength`/`maxLength` read its length — on submit and `trigger`, like every registered validator. On unmount the array branch follows the same effective `shouldUnregister` as a bound field: tombstone by default, keep the values when the option or the form-level `createForm({shouldUnregister: false})` says so.

### `useFieldArrayItem`

Per-row subscription for large arrays — the counterpart of TanStack Form's field api that `useFieldArray` alone cannot offer. `useFieldArray` subscribes to the whole branch, so any row's edit re-renders the component holding the array (and, without memoization, every row). `useFieldArrayItem` gives one row — identified by the stable `id` from `fields[i].id` — a subscription of its own:

```jsx
import {useFieldArray, useFieldArrayItem} from 'react-f0rm';

const Row = React.memo(function Row({id}) {
  const item = useFieldArrayItem({name: 'tags', id});
  return (
    <div>
      <input
        value={item.value ?? ''}
        onChange={e => item.setValue(e.target.value)}
      />
      {item.error && <span>{item.error}</span>}
    </div>
  );
});

function Tags() {
  const {fields, append, remove} = useFieldArray({name: 'tags'});
  return (
    <div>
      {fields.map(field => (
        <div key={field.id}>
          <Row id={field.id} />
          <button type="button" onClick={() => remove(field.index)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => append('')}>
        Add Tag
      </button>
    </div>
  );
}
```

Editing row K re-renders only row K, and a whole-array rewrite (`update`, `append`) re-renders only rows whose value actually changed — untouched rows' renders stay at zero. Two requirements make that hold:

- a `useFieldArray({name})` must be mounted at the same path — it publishes the id table rows resolve against;
- the row component must be `React.memo` with stable props (`id`, optionally `form`): everything else comes from the hook, so the array component's own re-render cannot drag the rows along.

Rows whose index migrates — `remove`/`move`/`swap`/`insert` reshuffles — re-render by design: the row's path contains the index, exactly like TanStack Form's per-field api. `replace` regenerates every id, so every row remounts. The win is single-row edits staying single-row.

The hook returns `{value, setValue, errors, error, name, index, form}` — the `useField`-style shape plus `index` and `name` (the row's current path key, e.g. `["tags",0]`) for building nested fields. Value reads and writes live on the array layer — the same layer every `useFieldArray` operation touches — so `value`, `setValue` and `update`/`append`/… always agree with each other; editing through a leaf-path `useField({name: ['tags', i]})` writes a different layer and does not flow into `item.value`.

Without a paired `useFieldArray` the row is inert rather than broken: `index` is `-1`, `value` is `undefined`, and `setValue` is a no-op.

### `useTransform`

Bind a control whose display value differs from the stored value — number inputs, date pickers, selects that store objects. TanStack Form's `useTransform` counterpart, with the round trip split into two explicit directions: the store always carries the raw typed value, `toDisplay` maps it to what the control renders, `fromDisplay` maps the control's value back to the raw value on write:

```jsx
import {useTransform} from 'react-f0rm';

function AgeField() {
  const age = useTransform(form, 'age', {
    toDisplay: raw => String(raw),
    fromDisplay: display => Number(display)
  });
  return <input value={age.value} onChange={e => age.onChange(e.target.value)} />;
}
```

`value` subscribes to 'change' at leaf scope like a controlled `useField` value — typing, programmatic `setValue` and ancestor writes re-derive it, writes elsewhere never re-render it. `onChange` writes through the user-change channel: with a field mounted at the same path, the mode/reValidateMode-gated validation fires exactly as if the user typed into a bound field (and validators receive the raw value, not the display string); with no mounted field it degrades to a plain value write. Touched marking stays a blur concern — pair with `useField` at the same path when blur semantics matter. Both directions are optional: omit `toDisplay`/`fromDisplay` for identity, and either one alone gives you a one-way transform.

### `createFormContext`

The module-level context serves one form per subtree; nesting two forms (or reusing a component under a different form) makes them fight over it. `createFormContext` builds an isolated bundle of bindings, typed against your values shape:

```tsx
import {createFormContext} from 'react-f0rm';

interface Values {
  name: string;
  email: string;
}

const ProfileForm = createFormContext<Values>();

function NameField() {
  // name is constrained to FieldPath<Values>; value is inferred as string
  const {value, onChange} = ProfileForm.useField({name: 'name'});
  return <input value={value} onChange={e => onChange(e.target.value)} />;
}
```

Each call returns `{context, FormProvider, useFormContext, useField, useFieldArray, useFieldArrayItem}` bound to a private React context — pass the form via `<ProfileForm.FormProvider form={form}>`, and providers from separate instances never see each other's forms.

The bundle also carries its raw React context, so `<Form>` can provide into it while keeping its full submit machinery — validation, submit handling, focus-on-error — instead of you wiring `<FormProvider>` + `handleSubmit` by hand:

```tsx
const ProfileForm = createFormContext<Values>();

<Form context={ProfileForm.context} form={form} onValidSubmit={save}>
  <NameField /> {/* ProfileForm.useField resolves the form <Form> manages */}
  <button type="submit">Save</button>
</Form>
```

The module-level `useFormContext()`/`useField` do not see that form — that is the isolation working.

## Controlled Forms

Pass a `values` prop to `<Form>` (or `values` to `useForm`) to drive the form from outside:

```jsx
<Form
  values={selectedRecord}
  onValidSubmit={values => save(values)}
>
  <Field name="email" />
</Form>
```

Whenever the `values` reference changes, the new object is synced into the form: uncommitted user edits are discarded — master-detail semantics, where selecting another record replaces the draft — while touched flags and errors are kept. The sync guard is reference-first with a structural fallback: re-renders that pass the same `values` reference never re-sync, and neither does an inline literal whose content is structurally equal to what the form was last seeded from — only genuinely different content replaces the draft, so an unrelated re-render never interrupts what the user is typing.

## Disabled

Disable a whole form — during submission, while a record loads, or for read-only views:

```jsx
const form = useForm({disabled: isReadOnly});

// or toggle at runtime — every bound field re-renders:
setDisabled(form, true);
```

The flag is OR-ed into every bound field: `Field`, `Checkbox` and `Select` render their control disabled when either the form flag or their own `disabled` prop is true — a field cannot opt out of a disabled form. `useField` exposes the merged flag as `disabled`, kept live through the form's event core:

```jsx
const {disabled, value, onChange} = useField({name: 'email'});
```

## Submit Handlers

```jsx
<Form
  initialValues={{email: ''}}
  onValidSubmit={(values, e) => {
    // Called after successful validation
    saveToServer(values);
  }}
  onInvalidSubmit={(errors, values) => {
    // Called when validation fails
    // errors: [{path: 'email', type: 'custom', message: 'Invalid email'}]
    console.error(errors);
  }}
>
  <Field name="email" />
  <button>Submit</button>
</Form>
```

`onSubmit`/`onValidSubmit` only run once both native constraint validation (see [Accessibility](#accessibility)) and your custom validators pass.

### `handleSubmit`

The same submit flow is available as a standalone function — the headless counterpart of `<Form>`'s submit wiring, usable where there is no `<form>` element (React Native, toolbar buttons, …):

```jsx
import {useForm, handleSubmit} from 'react-f0rm';

function Profile({onSave}) {
  const form = useForm({initialValues: {email: ''}});
  const submit = handleSubmit(form, {
    onSubmit: values => onSave(values),           // runs first on success
    onValidSubmit: values => console.log(values), // then this
    onInvalidSubmit: (errors, values) => console.error(errors)
  });
  return <Button title="Save" onPress={submit} />;
}
```

All callbacks are optional — a missing one is simply skipped. The returned handler runs the full submit state machine (`isSubmitting`, `submitCount`, `isSubmitSuccessful`) around native constraint validation (skipped when the event target has no `checkValidity`) and your validators, and can be invoked with or without an event object.

`onInvalidSubmit` receives an array of `{path, type, message}` entries: custom validation failures carry dotted paths with your validator's type (`'custom'` for plain strings, `'standard'` for the Standard Schema adapter), and native constraint failures carry `type: 'native'` — `path` is the dotted field path and `message` comes from the browser's `validationMessage`. Native failures are read from the DOM and never enter the form's error state.

### Submit button state

`useCanSubmit(form)` is the single flag a submit button's `disabled` prop wants — `!isSubmitting && !hasErrors`:

```jsx
import {useForm, useCanSubmit, handleSubmit} from 'react-f0rm';

function Profile({onSave}) {
  const form = useForm({initialValues: {email: ''}});
  const canSubmit = useCanSubmit(form);
  return (
    <button disabled={!canSubmit} onClick={handleSubmit(form, {onSubmit: onSave})}>
      Save
    </button>
  );
}
```

It is `false` for the whole async `onSubmit` span (not just the validation pass) and whenever any field holds an error — client validation or server backfill (`setServerErrors` lands there too). Deliberately no dirty or validating semantics: an untouched-but-clean form can submit. The snapshot recomputes on either input's event and re-renders only when the boolean itself flips. The underlying readers stay exported — `useIsSubmitting`, `useHasErrors`, `useSubmitCount` — for UIs that need the parts separately.

For the validation span itself reach for `useIsValidating(form)` — `true` while any field's async validator or pending debounce window is open and while the form-level validate round is in flight (the same marks `trigger` and submit wait out). The classic consumers are a spinner and a double-click guard on the same button:

```jsx
import {useIsValidating} from 'react-f0rm';

const isValidating = useIsValidating(form);
<button disabled={!canSubmit || isValidating} onClick={submit}>
  {isValidating ? 'Checking…' : 'Save'}
</button>
```

`useCanSubmit` stays validating-free on purpose (see above), so combine the two flags when you want the stricter gate. The submission-outcome sibling `useIsSubmitSuccessful(form)` is exported alongside: `true` once `onSubmit`/`onValidSubmit` resolved without throwing, `false` when validation failed or a handler threw, `undefined` before the first submit — the usual success-banner/redirect trigger.

### Focusing the first error

After a failed submit, the offending field is focused automatically — pass `shouldFocusError: false` (on `<Form>` or `handleSubmit`) to disable; it defaults to `true`. Custom validation failures focus the first errored field through a `'focusError'` event that bound fields (like `Field`) subscribe to; native constraint failures focus the submitted form's first `:invalid` control directly.

The same channel is exposed as an imperative API:

```jsx
import {setFocus} from 'react-f0rm';

setFocus(form, 'email');                            // focus the bound field's element
setFocus(form, 'user.name', {shouldSelect: true});  // focus and select its text
```

`setFocus` rides the `'focusError'` event, so it is a silent no-op when the field is unmounted or nothing subscribes — unknown names never throw.

## Validation

### Validation modes

`mode` controls when field validators run; `reValidateMode` controls when a field is re-validated once it already has an error — it supplements `mode` in every mode:

| Option | Values | Default |
|---|---|---|
| `mode` | `'onSubmit'` \| `'onBlur'` \| `'onChange'` \| `'onTouched'` \| `'all'` | `'onSubmit'` |
| `reValidateMode` | `'onChange'` \| `'onBlur'` \| `'onSubmit'` | `'onChange'` |

- `'onSubmit'` — validate only on submit.
- `'onBlur'` — validate when the field loses focus.
- `'onChange'` — validate on every change.
- `'onTouched'` — validate on the first blur, then on every change.
- `'all'` — validate on both change and blur.

```jsx
import {createForm} from 'react-f0rm';

const form = createForm({
  initialValues: {email: ''},
  mode: 'onBlur',            // validate on blur…
  reValidateMode: 'onChange' // …then re-validate on every change once errored
});
```

#### Per-field mode override

Sometimes one field deserves a different schedule than the rest of the form — a signup form that validates on submit, except the email field whose check should fire as soon as the user leaves the input. Any field can declare its own `mode`: it replaces the form-level `mode` for that field only, while every other field keeps the form's timing.

```jsx
import {Form, Field, useForm} from 'react-f0rm';

function Register() {
  // Form default: validate on submit.
  const form = useForm({initialValues: {email: '', bio: ''}});

  return (
    <Form form={form}>
      {/* This field alone validates on blur... */}
      <Field name="email" mode="onBlur" validate={checkEmail} />
      {/* ...while every other field waits for submit. */}
      <Field name="bio" />
    </Form>
  );
}
```

The same option exists on `useField` (and `Checkbox` / `Select`):

```jsx
const email = useField({name: 'email', mode: 'onBlur', validate: checkEmail});
```

- Accepted values are the same `ValidationMode` union as the form's `mode`; omit it and the field follows `form.mode` exactly as before.
- Precedence is per field: `field.mode ?? form.mode`. A field cannot change another field's timing, and declaring `mode: 'onSubmit'` opts a field out of an `'onChange'` form.
- `reValidateMode` stays form-level for every field: once a field has an error (after a failed submit, say), re-validation follows the form's `reValidateMode` regardless of the field's own `mode` — a `mode: 'onBlur'` field with the default `reValidateMode: 'onChange'` still re-validates on every keystroke while errored.
- Manual `trigger` and submit validation are unaffected — they always run the field's validators regardless of any mode.

### Triggering validation manually

`trigger` runs field validators on demand. Without a name it runs every registered validator; a single name — or an array of names — narrows it to those fields:

```jsx
import {trigger} from 'react-f0rm';

trigger(form);                               // every registered field validator
trigger(form, 'email');                      // one field
trigger(form, ['user.name', 'user.email']);  // several
```

`trigger` returns a promise that waits for the triggered validation to settle — async validators and pending debounce windows included — so errors have already landed in `form.errors` when it resolves. It never rejects: landing errors is the expected outcome here, not a failure. It resolves `true` when the triggered scope is error-free, `false` otherwise:

```jsx
if (await trigger(form, 'email')) {
  proceed(); // 'email' is now guaranteed error-free
}
```

Without `name` the scope is all fields plus the form-level `validate` result; with `name` only those fields' own errors count and form-level `validate` is skipped (RHF semantics). Fire-and-forget callers may ignore the promise — the validator kicks still happen synchronously.

The third argument opts into touched marking: `trigger(form, name, {shouldTouch: true})` marks every path in the triggered scope — the given names, or all registered fields when `name` is omitted — as touched once the round settles, whether validation passed or failed (react-hook-form's `trigger` semantics). Omitted, `trigger` stays validate-only:

```jsx
await trigger(form, 'email', {shouldTouch: true}); // 'email' is now touched, error or not
```

### Async validation

Async validators are first-class. Two knobs keep them cheap and race-free:

**`validateDebounce`** (on `Field`, `useField` or any bound component) delays a field's validation kicks by the given milliseconds; only the last kick inside the window runs the validator. While the timer is pending the field counts as *validating*, so `trigger` and submit wait the window out instead of racing it. The `required` rule is exempt: it runs synchronously on every kick, so a required failure shows immediately — and while it fails, the field's other validation is skipped. The form-level `validate` gets the same contract through `validateDebounce` on `createForm`/`useForm` (see [Form-level validation](#form-level-validation)).

**`asyncAlways`** (on `Field`/`useField`, with a form-level `createForm({asyncAlways})` default; TanStack Form's namesake) overrides that skip: a field whose `required` gate failed still runs its debounced validator, and the validator's result lands **alongside** the gate's errors, per-source — a passing async round clears only its own errors, the gate's verdict stays until the gate itself passes. The use case: the cheap format check fails, and the expensive backend check should still run — both verdicts belong on screen.

**`meta.signal`** — every validator's second argument carries `{form, path, signal}`. The `AbortSignal` fires as soon as the round is superseded (a newer round started, or the field unregistered), so async validators can cancel their underlying work instead of racing a stale result home:

```jsx
<Field
  name="email"
  validateDebounce={300}
  validate={async (value, {signal}) => {
    const res = await fetch(`/api/check-email?email=${encodeURIComponent(value)}`, {signal});
    const {taken} = await res.json();
    if (taken) return {type: 'taken', message: 'Email already registered'};
  }}
/>
```

Stale results are dropped independently of the signal — validators that ignore it stay correct — but passing it to `fetch` (or `AbortSignal.timeout`, timers, …) also cancels the network work itself.

### Multiple errors per field

Every field stores an ordered `FieldError[]`, not a single error. The first entry is what `error`/`errorObject`/`getError` expose; readers that want all of them use `getFieldErrors(form, name)` or `useFieldErrors(form, name)`:

```jsx
import {getFieldErrors, useFieldErrors, setError} from 'react-f0rm';

const all = getFieldErrors(form, 'password');
// [{type: 'min', message: 'Too short'}, {type: 'pattern', message: 'Needs a digit'}]

setError(form, 'password', [
  {type: 'min', message: 'Too short'},
  {type: 'pattern', message: 'Needs a digit'}
]);
```

`setError` accepts a string, a `FieldError`, an array mixing both, or `undefined` to clear. A fourth argument opts into side effects: `setError(form, 'email', 'taken', {shouldFocus: true})` focuses the field's element right after the error lands (the same `'focusError'` channel a failed submit's auto-focus uses — only mounted bound fields react). Schema resolvers pass every issue through — a value breaking several rules collects all of them (Standard Schema/zod by design, yup via `abortEarly: false`) — and `getErrors()` contributes one entry per error. For imperative clears, `clearErrors(form)` wipes every error while `clearErrors(form, name)` — one name or an array of names — clears only those fields.

### `setValue` options

The fourth argument to `setValue` opts into side effects. `shouldValidate`/`shouldTouch` default to `false`; omitting the object keeps the plain set-value behavior:

```jsx
import {setValue} from 'react-f0rm';

setValue(form, 'email', 'a@b.com', {
  shouldValidate: true, // run the field's registered validator after the value lands
  shouldTouch: true,    // mark the field as touched
  shouldDirty: false    // land the value as a commit: it becomes the field's dirty baseline
});
```

Dirty state is derived, not marked: a field is dirty while its live value differs from `initialValues` (reverting to the initial value makes it clean again). That makes `shouldDirty` a one-sided flag. `shouldDirty: false` declares this write a **commit instead of an edit** — the written value becomes that field's dirty-comparison baseline, so `getDirtyFields`/`isDirty`/`getFieldState().isDirty` read the field as clean immediately, and a later write dirties it only by differing from the new baseline:

```jsx
setValue(form, 'email', 'normalized@x.com', {shouldDirty: false});
getDirtyFields(form); // {} — the normalization is not a user edit

setValue(form, 'email', 'normalized@x.com'); // still clean: equal to the baseline
setValue(form, 'email', 'a@b.com');          // dirty: differs from it
```

Use it whenever a programmatic write is not user input — normalized/formatted values, autofill, defaults applied after mount — and you don't want it to trip the "unsaved changes" state. `shouldDirty: true` (or omitting the flag) is the default derived behavior spelled out; unlike react-hook-form, where `setValue` skips dirty marking unless opted in, react-f0rm always derives dirty from the comparison and `false` is the opt-out.

The value argument may also be an updater function receiving the field's current value and returning the next one (TanStack Form's `setFieldValue` contract) — handy for increments and array transforms:

```jsx
setValue(form, 'count', c => c + 1);
setValue(form, 'tags', tags => [...tags, 'new']);
```

The tradeoff this implies: a function can never itself be stored as a field value through `setValue`.

Committed baselines follow the form's lifecycle: `reset`, `setInitialValues` and `resetField`/`removeField` drop them (the state they measured against is gone), and a wholesale write at an ancestor path — a `useFieldArray` rewrite, say — drops baselines beneath it, since the subtree they were committed against no longer exists.

### Writing as a user change (`changeValue`)

`setValue` is the imperative channel — `shouldValidate` kicks the field's validator unconditionally, ignoring any mode. `changeValue` is the user-change channel: the write rides the same core pipeline a user typing into the field would fire (`userChangeByPath` + the field-mode registry — `useField` registers its mode override on mount), so it fires exactly the validation a user typing would fire — the field's effective `mode` (per-field override included) and the form's `reValidateMode`. With no mounted field on the path it degrades to a plain `setValue`.

```jsx
import {changeValue} from 'react-f0rm';

// An onSubmit form with the default reValidateMode 'onChange': quiet
// while the field has no error, re-validates once it does — same as typing.
changeValue(form, 'email', 'a@b.com');
```

This is the channel component libraries need when they hand a control a plain setter bound to a field (a `Control`/controlled-bridge over `useField`'s value): the mode gating — per-field override and live-error view — lives in the core's user-change pipeline, not in public form state, so the write must route through it rather than through a raw `setValue`.

`changeValue` takes the same options object as `setValue` (see [`setValue` options](#setvalue-options)). With a field mounted on the path, `shouldDirty: false` applies — the write lands as a commit while the field's own mode gating keeps driving validation, which is the point of this channel (`shouldValidate`/`shouldTouch` have no meaning there: forcing them would defeat the gating). With no mounted field, the options forward to the plain `setValue` fallback wholesale:

```jsx
changeValue(form, 'email', 'normalized@x.com', {shouldDirty: false});
```

### Field-level validation

Pass a `validate` function to `Field` or `useField`. Return an error string, a `FieldError` object or `undefined` — sync or async:

```jsx
<Field
  name="email"
  validate={value => {
    if (!value.includes('@')) return 'Invalid email';
  }}
/>
```

### Rules

For declarative constraints, pass `rules` to `Field` (or any bound component — `Checkbox`, `Select` — or `useField`). Rule failures land in the form's error state as `FieldError`s (`type` is the rule name) carrying your message, so any design system can render them uniformly instead of the browser's validity bubble:

```jsx
<Field
  name="age"
  rules={{
    required: 'Age is required',
    min: 18,
    messages: {min: 'Must be an adult'}
  }}
/>
```

| Rule | Value | Fails when | Default message |
|---|---|---|---|
| `required` | `string \| true` | value is `''`, `undefined` or `null` (`0` and `false` count as filled) | `'This field is required'` |
| `min` | `number` | `Number(value) < min` — values converting to `NaN` skip the rule | `` `Must be at least ${min}` `` |
| `max` | `number` | `Number(value) > max` — `NaN` skips | `` `Must be at most ${max}` `` |
| `minLength` | `number` | a string value is shorter — non-strings skip | `` `Must be at least ${n} characters` `` |
| `maxLength` | `number` | a string value is longer — non-strings skip | `` `Must be at most ${n} characters` `` |
| `pattern` | `{value: RegExp, message: string}` | `pattern.value.test(value)` is false | the given `message` |
| `validate` | `fn \| Record<string, fn>` | the callback returns an error (string or `FieldError`) | the returned message |

`validate` is react-hook-form's `register({validate})` shape: one function, or a record of named functions. Each runs after the declarative checks — and only when they passed (`required` failing short-circuits the rest). A returned error keeps its message; its `type` becomes the record key (`'validate'` for the single-function form), so consumers can switch on `error.type` like with every declarative rule:

```jsx
<Field
  name="username"
  rules={{
    required: true,
    validate: {
      notReserved: v => (v === 'admin' ? 'That name is taken' : undefined),
      noSpaces: v => (/\s/.test(v) ? 'No spaces allowed' : undefined)
    }
  }}
/>
```

The optional top-level `messages` record overrides messages per rule type (`min`, `max`, `minLength`, `maxLength`, `pattern`) — useful for centralizing or localizing them.

Semantics:

- A failing `required` short-circuits the rest — an empty value reports only its `required` error, not a full panel — and skips `validate` entirely for that kick: the async check never sees an empty value (`asyncAlways` overrides that skip — see [Async validation](#async-validation)).
- `required` runs synchronously on every kick, even under a positive `validateDebounce`: its error shows on the keystroke and clears as soon as the value is filled.
- Every other failing rule collects into one ordered `FieldError[]` (see [Multiple errors per field](#multiple-errors-per-field)).
- The other rules compose with `validate`: they run first, then `validate` (awaited when async), merging both sources' errors with rules ahead. They ride the same pipeline as `validate` — `mode`, `reValidateMode`, `validateDebounce` and `meta.signal` all apply unchanged.

Rules render as **native constraint attributes** too: the declarative subset (`required`, `min`, `max`, `minLength`, `maxLength`, `pattern`) lands on the element for browser and assistive-tech hints — `:invalid`/`:user-invalid` styling, screen-reader announcements, mobile input modes. The store pipeline stays the source of truth for messages: rule failures still land in the form's error state and render through `renderError`/`aria-invalid`, never through a browser bubble you don't control. A user-passed `required`/`pattern`/… prop always wins over the derived attribute; `validate` callbacks have no native counterpart and are skipped.

Native constraints vs `rules`: HTML attributes (`required`, `type="email"`, `min`, …) keep running through the browser's `checkValidity`, whose bubble remains the pre-submit fallback. `rules` is the state-side alternative — failures are queryable (`getErrors`, `error`, `errors`), renderable by any UI, and carry your own messages — with the native attributes layered on top for a11y and styling. Prefer `rules` whenever the error text must be controlled.

### Form-level validation

Pass a `validate` function to `createForm`. It receives all values and returns a record of errors. Nested objects are flattened recursively — `{user: {name: 'Required'}}` sets the error at `user.name` — and plain flat results keep working:

```jsx
import {createForm} from 'react-f0rm';

const form = createForm({
  initialValues: {password: '', confirm: ''},
  validate: values => {
    if (values.password !== values.confirm) {
      return {confirm: 'Passwords do not match'};
    }
  },
});
```

The validate function may be async (it is awaited), and its optional second argument carries `{form, signal}` — the same contract as field validators' `meta`. Add `validateDebounce` (milliseconds) to give the whole-form validate the per-field window contract: kicks from `trigger`/submit inside the window merge into one run reading the values current when the window closes, and while the timer is pending the form counts as *validating*, so `trigger` and submit wait the window out instead of racing it:

```jsx
const form = useForm({
  validate: async (values, {signal}) => {
    const res = await fetch('/api/validate', {
      method: 'POST',
      body: JSON.stringify(values),
      signal
    });
    const {errors} = await res.json();
    return errors; // nested error record, flattened like above
  },
  validateDebounce: 300
});
```

The `AbortSignal` fires as soon as the round is superseded — a newer round started, which under a positive `validateDebounce` means a kick landed during the in-flight round's window — so async validators can cancel their underlying work instead of racing a stale result home. Stale results are dropped independently by the round gate, so validators that ignore the signal stay correct too. Without `validateDebounce` (`0`/omitted) the validate runs once per `trigger`/submit exactly as before; it still receives the meta argument, but nothing supersedes an immediate round, so its signal never fires.

#### Reading form-level errors

Errors that belong to no single field need a slot to land in: a form-level `validate` record may return a `_form` entry, and the Standard Schema adapter drops every path-less issue there (see [Schema validation](#schema-validation)). That reserved key is exported as `FORM_ERROR`, so the magic string never has to be hand-written:

```jsx
import {FORM_ERROR, useFormError, useFormErrors} from 'react-f0rm';

function FormErrorBanner({form}) {
  const error = useFormError(form); // first form-level error's message
  return error ? <p role="alert">{error}</p> : null;
}
```

`useFormError(form)` reads the slot's first message (`undefined` while clean) — the classic consumer is one banner above the submit button. `useFormErrors(form)` reads every error stored under the key (`FieldError[]`, stable reference between unrelated events). The imperative twins are `getError(form, FORM_ERROR)` and `getFieldErrors(form, FORM_ERROR)`, and writes go through the same `setError(form, FORM_ERROR, …)` every field uses.

#### Re-running on dependent field changes (`validateDeps`)

By default the form-level `validate` runs on `trigger` and submit only — a cross-field error stays on screen even after the user edits the field that would fix it. `validateDeps` declares the fields whose **user changes re-run the form-level `validate`**:

```jsx
const form = useForm({
  initialValues: {password: '', confirm: ''},
  validate: values =>
    values.password !== values.confirm
      ? {confirm: 'Passwords do not match'}
      : {},
  validateDeps: ['password']
});
```

Now the submit-then-fix flow works: submit lands the mismatch on `confirm`, editing `password` re-runs the validate, and the passing round makes the error disappear. The re-run timing rides the same mode matrix as any field validator, evaluated against the changed field's effective `mode` (per-field override included) and the form's `reValidateMode`:

| Situation | Dep change re-runs the form validate? |
|---|---|
| `mode: 'onChange'` / `'all'` (form or the dep field) | yes, error state or not |
| `mode: 'onTouched'`, dep field touched | yes |
| otherwise, the last round's error is live **and** `reValidateMode: 'onChange'` (default) | yes — the submit-then-fix flow |
| `reValidateMode: 'onBlur'` / `'onSubmit'` | no — a change is not a blur; re-runs wait for their own trigger |

Details that fall out of the plumbing:

- **User changes only.** The kick rides the mounted field's own change pipeline, so typing and `changeValue` (component-library bridges) both fire it, while programmatic `setValue` does not — exactly like field validators. A dep path with no mounted field never re-runs the validate.
- **Round-scoped error ownership.** Opting in changes what a re-run may clear: each round first drops the errors the *previous round* wrote, then lands its own result — so a passing re-run clears the stale mismatch. Errors the round never wrote (field validators', `setServerErrors`, manual `setError`) survive it, and a foreign write onto a round-owned path takes the key out of the round's ownership.
- **`validateDebounce` applies.** Dep-change kicks are ordinary kicks: they merge inside the debounce window like `trigger`/submit kicks do.
- Forms that don't set `validateDeps` keep the historical behavior untouched — the form validate runs on `trigger`/submit only, and re-runs never clear earlier errors.

TanStack Form's counterpart is `onChangeListenTo` (v1) / validator `triggers` (v2 alpha); both re-run a validator when listed fields change. react-f0rm keeps the declaration at the form level (the validate belongs to the form) and gates the re-run by the library's own `mode`/`reValidateMode` semantics instead of adding an always-on listener.

#### Field-to-field linkage (`validateDeps` on `useField`)

The same declaration exists per field: `validateDeps` on `useField` lists the **other** fields whose user changes re-run **this field's validator** — the field-level shape of the option above, for cross-field rules you want as field errors (queryable via `getError`, renderable by `renderError`) without a form-level validate:

```jsx
const form = useForm({
  initialValues: {password: '', passwordConfirm: ''}
});

function PasswordConfirmField() {
  const {value, onChange, error} = useField({
    form,
    name: 'passwordConfirm',
    validate: v => (v === getValue(form, 'password') ? undefined : 'Passwords do not match'),
    validateDeps: ['password']
  });
  // ...
}
```

The re-run semantics mirror the form-level option exactly, because it rides the same channel — the changed field's own onChange pipeline:

| Situation | Dep change re-runs this field's validator? |
|---|---|
| `mode: 'onChange'` / `'all'` (form or the dep field) | yes, error state or not |
| `mode: 'onTouched'`, dep field touched | yes |
| otherwise, this field shows an error **and** `reValidateMode: 'onChange'` (default) | yes — the submit-then-fix flow |
| `reValidateMode: 'onBlur'` / `'onSubmit'` | no — re-runs wait for their own trigger |

- **User changes only.** Typing and `changeValue` fire it; programmatic `setValue` does not. A dep path with no mounted field never re-runs the validator.
- **A passing re-run clears the error.** A field validator owns its whole error key (every kick's result replaces the previous list), so the submit-then-fix flow needs no footprint bookkeeping: edit `password` until it matches and the confirm error disappears.
- **`validateDebounce` applies** — the re-run is an ordinary kick of this field's validator, debounce window included.
- Listing the field's own path is a no-op (its own change already validates it), and unmounting the dependent field drops the linkage.

### Schema validation

Any library implementing [Standard Schema v1](https://standardschema.dev) — zod v3.24+/v4, valibot v1, arktype and more — works through one adapter, imported from its own tree-shakeable entry point:

```jsx
import {Form, Field, createForm} from 'react-f0rm';
import {
  standardSchemaFormValidator,
  standardSchemaResolver
} from 'react-f0rm/resolvers/standard-schema';
import {z} from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

// Form-level: validate the whole values object; issue paths map to
// field errors automatically, issues without a path land on `_form`
const form = createForm({
  validate: standardSchemaFormValidator(schema)
});

// Field-level: validate a single value
<Field name="email" validate={standardSchemaResolver(z.string().email())} />
```

Schema errors come back as `{type: 'standard', message}`.

On success the adapter returns the schema's parsed output, which the form stores as its `parsedValues` baseline: `getValues()` and submit callbacks (`onSubmit`/`onValidSubmit`) read coerced/transformed values — `z.coerce.number()` hands back a real `number`, not the raw string. The baseline sits between `initialValues` and live edits, so fields the user changes afterwards still win, and dirty state keeps comparing live edits against `initialValues` only — parsing never marks a field dirty. `reset()` and `setInitialValues()` clear the baseline.

#### Schema defaults

**Standard Schema v1 has no default-value metadata.** The interface carries types and `validate` and nothing else — whether a field declares a default, and how to read it, is vendor territory: zod v3.24 exposes `.getDefault()` per field, zod v4 wraps defaulted fields in a `ZodDefault` whose `.def.defaultValue` is a de-facto-public field rather than a documented accessor, valibot ships a `getDefault` util. None of it is reachable through the standard surface, and react-f0rm reads schemas only through `~standard.validate` — probing `schema.shape`/`.def` internals per vendor is exactly the adapter-per-library tree this library refuses to grow. So `defaultValues` derived from a schema is deliberately **not** a library feature: pass `initialValues` explicitly.

What you do get for free: defaults flow through `validate`. A schema's parsed output contains every declared default, so after the first successful validation the `parsedValues` baseline already serves them — `getValues()` reads `z.string().default('anon')` fields as `'anon'` without any seeding. The gap is only the render before the first validation round, and two recipes close it user-side:

```jsx
// 1. Vendor-neutral: one parse of an empty object materializes every
//    default the schema declares (nested ones included).
const result = schema['~standard'].validate({});
const initialValues = result.issues ? {} : result.value;

const form = useForm({initialValues, validate: standardSchemaFormValidator(schema)});
```

The empty parse succeeds only where defaults cover everything; a required field without a default fails it, and `{}` is the honest seed in that case. For per-field extraction instead of a whole-object parse, do it through the vendor's own API — zod v4:

```jsx
// 2. zod v4: ZodDefault wrappers expose their default on .def
const defaultValues = Object.fromEntries(
  Object.entries(schema.shape).map(([key, field]) => [
    key,
    field.def?.type === 'default' ? field.def.defaultValue : undefined
  ])
);
```

(zod v3.24: the same loop calling `field.getDefault()`. That this loop is version-specific is the point — it is your schema and your vendor, not the form library's, contract to maintain.)

### Delaying error display

`delayError` (milliseconds) holds a newly appearing error back from the render for a short window — users typing through a field are not interrupted by an error the next keystroke may already fix:

```jsx
<Field name="username" rules={{minLength: 3}} delayError={300} />
```

The delay is render-layer only: `error`/`errorObject`/`errors` from `useField` (and everything `Field` derives from them — `aria-invalid`, `renderError`) stay `undefined`/empty until the window passes. The form's error state is never delayed — `trigger`, submit and `getError(form, name)` read the error immediately, unlike react-hook-form's formState-level delay. An error that clears inside the window never shows at all; once an error is visible, later changes (a new message, entries added or removed) apply immediately — only the none → some transition waits.

## Dirty & Touched Fields

```jsx
import {useDirtyFields, useTouchedFields} from 'react-f0rm';

function FormStatus({form}) {
  const dirtyFields = useDirtyFields(form); // {'user.name': true, 'tags.0': true}
  const touched = useTouchedFields(form);   // ['user.name', 'tags.0']
  return (
    <p>{Object.keys(dirtyFields).length} dirty, {touched.length} touched</p>
  );
}
```

Both hooks expose user-facing dotted paths (`'a.b'`, `'a.0.c'`). The imperative counterparts `getDirtyFields(form)` and `getTouchedFields(form)` return the same shapes without subscribing.

For one field, `useIsFieldDirty(form, name)` subscribes at leaf scope — the per-field twin of `useIsDirty(form)`, applying the same rule `getFieldState(form, name).isDirty` does (committed `shouldDirty: false` baselines included; a leaf under a wholesale ancestor write reports clean, since dirtiness belongs to the branch that diverged). `useField` carries the same flag as `field.isDirty`, live in controlled mode; in `uncontrolled: true` mode it is pinned at mount like `value` (typing never re-renders the field), so `useIsFieldDirty` is the live channel there.

### Seeding new initial values

`setInitialValues(form, values)` swaps the baseline by **content**, not reference: passing a fresh object with equal content (the inline literal a re-render recreates) is a no-op — committed edits survive — while genuinely changed content re-seeds: live values and tombstones are cleared, touched flags and errors survive. Same value semantics `useForm({initialValues})`/`<Form initialValues>` sync with, so the editor-page shape works without memoizing the literal or double-passing it:

```jsx
const article = useData<Article>() ?? undefined;
// No useMemo needed: a new object per render with equal content never
// clears what the user typed; switching to another article re-seeds.
const form = useForm({initialValues: articleToValues(article)});
```

### Async initial values

`initialValues` accepts a Promise, or a thunk returning a value or Promise — react-hook-form's async `defaultValues` shape. The form starts empty with `isLoading: true`, and when the source resolves, its values become the baseline (setInitialValues semantics: value subscribers re-sync, dirty/touched start clean, `reset()` returns to the resolved values):

```jsx
const form = useForm({
  initialValues: () => fetchUser(id).then(u => ({name: u.name, email: u.email}))
});
const isLoading = useIsLoading(form); // also on useFormState(form).isLoading

if (isLoading) return <Spinner />;
return <Form form={form}>…</Form>;
```

Notes:

- The thunk runs at create time — keep its identity stable (`useMemo`, module scope) when passing it inline; StrictMode double-invokes it in development, like every render-phase call.
- A rejected source keeps the form empty, flips `isLoading` off and logs the error in DEV — attach a `.catch` on the source to handle it.
- SSR renders the form empty with `isLoading: true` on both sides, so hydration matches; the values land client-side after the fetch (pass the server-resolved record to hydrate eagerly instead).

### Resetting

`reset(form, initialValues?)` wipes values, errors, touched, tombstones and the submission flags (`isSubmitting`, `submitCount`, `isSubmitSuccessful`). The second argument installs a fresh baseline; omitted (or `undefined`), the form keeps its current `initialValues` and every field simply returns to its initial value — the plain `reset(form)` "undo everything" shape. The third opts into keeping slices of state through the reset:

```jsx
import {reset} from 'react-f0rm';

reset(form);                                // back to the current initialValues
reset(form, freshRecord);                  // full reset to the new baseline
reset(form, freshRecord, {keepDirtyValues: true});  // dirty drafts survive
reset(form, undefined, {keepTouched: true});  // reset, keep touched flags
```

`keepDirtyValues` is the refetch shape: reload the record from the server, but fields the user already edited keep their live values (dirtiness is measured against the pre-reset initialValues; clean fields fall back to the new baseline):

```jsx
const {data} = useQuery(['user', id], () => fetchUser(id));
// data changed (refetch, different user) — replace the draft,
// but never clobber fields the user is mid-edit on
useEffect(() => {
  if (data) reset(form, data, {keepDirtyValues: true});
}, [data]);
```

The other flags — `keepTouched`, `keepErrors`, `keepIsSubmitted`, `keepSubmitCount`, `keepIsSubmitting` — all default to `false`; omitting the object keeps the plain full-reset behavior.

### Resetting a single field

`resetField(form, name, options?)` resets one field and leaves the rest of the form alone: the field's live value is dropped (reads fall back to `initialValues` — when a schema's `parsedValues` baseline exists, its path is removed so the coerced output stops shadowing the initial value), and the field's touched flag and errors are cleared:

```jsx
import {resetField, getFieldState} from 'react-f0rm';

resetField(form, 'email');                      // back to initialValues
resetField(form, 'email', {keepTouched: true}); // keep the touched flag
resetField(form, 'email', {value: ''});         // explicit value, no fallback
```

| Option        | Default | Effect                                                        |
| ------------- | ------- | ------------------------------------------------------------- |
| `keepTouched` | `false` | Keep the field's touched flag                                 |
| `keepErrors`  | `false` | Keep the field's errors                                       |
| `value`       | —       | Explicit post-reset value; never falls back to `initialValues` |

Its read-side sibling `getFieldState(form, name)` returns one field's aggregated state — `{value, error, errors, isDirty, isTouched, isValidating}` — where `isDirty` applies the same rule as `getDirtyFields` (a live value differing from `initialValues`; parsing never counts) and `errors` is the stored array shared with `getFieldErrors`, so treat it as read-only:

```jsx
const {value, error, isDirty} = getFieldState(form, 'email');
```

## Accessibility

Bound fields (`Field`, `Checkbox`, `Select`) wire the error chain automatically: whenever the field has an error, the control gets `aria-invalid="true"` and its `aria-describedby` gains `fieldErrorId(name)` — the id the error message element is expected to carry. `fieldErrorId` is exported, so a custom error component only needs to render that id with `role="alert"` to complete the chain for screen readers:

```jsx
import {useFormContext, useError, fieldErrorId} from 'react-f0rm';

function FieldMessage({name}) {
  const form = useFormContext();
  const error = useError(form, name);
  return error ? (
    <span id={fieldErrorId(name)} role="alert" className="field-error">
      {error}
    </span>
  ) : null;
}

<Field name="email" />
<FieldMessage name="email" />
```

For the built-in path, provide a `renderError(error, id)` function instead: `Field` renders `<span id={id} role="alert">{renderError(error, id)}</span>` next to the input — same id, same wiring, no extra component:

```jsx
<Field
  name="email"
  renderError={error => <em>{error}</em>}
/>
```

A user-provided `aria-describedby` survives: on error, the field's id is appended after yours (`"hint email"`). Without an error, no `aria-describedby` is added.

Native constraint validation (`required`, `type=email`, `minLength`, …) gates submission: `<Form>` runs the browser's `checkValidity()` before custom validators, and failing constraints surface as native validation bubbles via `reportValidity()`.

## Server-side errors

Server 422s land on the same channel client-side validation uses. `setServerErrors(form, errors)` takes the flat `Record<string, string | string[]>` shape REST APIs commonly return — RealWorld's `422 {errors: {email: ['has already been taken']}}` needs no hand-rolled `Object.entries` + `setError` loop — and stores each entry as the field's error(s) with `type: 'server'`:

```jsx
import {setServerErrors} from 'react-f0rm';

async function onSubmit(values) {
  try {
    await api.post('/users', {user: values});
  } catch (e) {
    // e.data.errors: {email: ['has already been taken'], ...}
    setServerErrors(form, e.data.errors);
  }
}
```

The message then renders under the field through the same error machinery (`renderError`, `useError` — see [Accessibility](#accessibility)), and the field's `aria-invalid`/`aria-describedby` wiring kicks in automatically. Existing errors are cleared first — a fresh response describes the current state; pass `{keepExisting: true}` to layer instead. String values land as one error, string arrays as several; an empty array clears that field.

## Server-side validation

The client-side gate is UX, not security — payloads must be re-validated where they arrive. `react-f0rm/server` is the entry for that: a separate module graph with zero React, safe to import from Server Actions, RSC and plain Node, and — like the resolvers and devtools — never re-exported from the main entry, so client builds that never validate server-side stay at baseline size. Its export is one function:

```jsx
import {validateValues} from 'react-f0rm/server';

// A Server Action — or any handler that receives a payload
export async function saveProfile(values) {
  const {valid, values: parsed, errors} = await validateValues(values, {
    validate: values =>
      values.email.includes('@') ? undefined : {email: 'Invalid email'}
  });
  if (!valid) return {errors};
  return save(parsed);
}
```

`validateValues(values, options?)` spins up one throwaway form from `options` (its `initialValues` forced to `values`), runs a whole-form `trigger`, and reads the outcome back — async validators and `validateDebounce` windows are awaited, so the result is settled, never a mid-flight snapshot. The rules come from `options.validate`, the form-level validator: field validators register through mounted fields and nothing is mounted on the server, so pass `standardSchemaFormValidator(schema)` (from `react-f0rm/resolvers/standard-schema`) or a hand-written `validate`. The result carries:

- `valid` — `trigger`'s boolean. An invalid payload is a normal outcome, never a rejection: both branches are interesting on the server (persist vs. bounce back).
- `values` — the tree after the round. A schema validator's parsed output (coerce/transform included) becomes the baseline, so this is the tree to persist, not necessarily the object passed in.
- `errors` — the flat `{path, type, message}` entries, the same list `getErrors` hands out on the client. A one-liner lands a failed round back on the client form through the [Server-side errors](#server-side-errors) channel:

```jsx
setServerErrors(form, Object.fromEntries(errors.map(e => [e.path, e.message])));
```

The entry also re-exports `VALIDATION_OUTCOME`/`ValidationOutcome` for building branded validator results server-side without importing the package root (which would drag the React graph back in).

TanStack Form's counterpart is `createServerValidate`; theirs wraps the round inside a generated server action, while `validateValues` stays a plain function over values. That is the same stance as the client bridge — no `action` prop, no generated handler ("Server Actions: bridge, not first-class" in [Which one should you use?](#which-one-should-you-use), and the [React 19 Server Actions guide](docs-site/docs/guides/react19-server-actions.md) for the why): react-f0rm composes into your framework's handler instead of owning it.

## TypeScript

`FieldPath<T>` and `PathValue<T, P>` make field names and value types compile-time checked:

```tsx
import {FieldPath, PathValue, useField} from 'react-f0rm';

interface Values {
  user: {name: string};
  tags: string[];
}

// 'user' | 'user.name' | 'tags' | `tags[0]` | ...
type ValuesPath = FieldPath<Values>;

// string
type UserName = PathValue<Values, 'user.name'>;

function UserNameField() {
  // value is inferred as string; a path outside FieldPath<Values> — a
  // typo or an untyped string variable — is a compile error on these
  // generic APIs (react-hook-form parity). Segment arrays
  // (['user', 'name']) stay accepted and read as `any`.
  const {value, onChange} = useField<Values, 'user.name'>({name: 'user.name'});
  return <input value={value} onChange={e => onChange(e.target.value)} />;
}
```

The same generics work on `getValue`/`setValue`/`getError` and the other path-taking helpers.

The strictness is on the generic path APIs (`useField`, `setValue`, `getValue`, `useValue`, …): an unknown path fails there. Two escape hatches stay deliberately wide, because their names are runtime-computed by nature:

- **Segment arrays** (`['items', 0]`): accepted everywhere, value reads as `any` — the dynamic-path escape hatch.
- **Runtime-dynamic entry points**: `useFieldArray`, `useFieldArrayItem`, `removeField`, `setTouched`, `setFocus`, `trigger` and `clearErrors` take the wide `Name` type, so `name={dynamicString}` keeps compiling without casts.

The default context is typed too — `useFormContext<Values>()` returns a `Form<Values>`, so downstream components drop the `any` dances (`eslint-disable no-unsafe-*`, value casts) without buying into `createFormContext`:

```tsx
import {useFormContext, useValue} from 'react-f0rm';

function EmailError() {
  const form = useFormContext<Values>();
  const email = useValue(form, 'email'); // string
  return email === '' ? <p>Email is required</p> : null;
}
```

And a `Field` tied to a typed form infers its `validate` argument from the path — `PathValueOf<Values, P>` — via the `form` prop (a plain `string` name keeps the old permissive `any`, matching `useField`):

```tsx
const form = useForm<Values>();

<Form form={form} initialValues={{email: ''}}>
  <Field
    form={form}
    name="email"
    validate={value => (value.includes('@') ? undefined : 'Invalid email')}
  />
  {/* nested paths resolve through the shape: string | undefined */}
  <Field
    form={form}
    name="user.bio"
    validate={value => (value === undefined ? 'Tell us something' : undefined)}
  />
</Form>
```

## Custom Components

Use the `as` prop to render a custom component instead of `<input>`:

```jsx
function TextArea({value, onChange, ...props}) {
  return <textarea {...props} value={value} onChange={e => onChange(e.target.value)} />;
}

<Field name="bio" as={TextArea} />
```

`Select` is a controlled `<select>` — pass the options as children. A single select stores the selected option's value as a string; `multiple` stores the values of all selected options as a string array:

```jsx
import {Select} from 'react-f0rm';

<Select name="country">
  <option value="cn">China</option>
  <option value="jp">Japan</option>
</Select>

<Select name="tags" multiple>
  <option value="a">Tag A</option>
  <option value="b">Tag B</option>
</Select>
```

**File inputs.** The DOM keeps `<input type="file">`'s `value` read-only — it holds a fake file path string and throws if you assign to it, so the control cannot be driven like other inputs. The controlled model adapts by storing the selection itself: leave the input uncontrolled and commit the chosen `File` object on change:

```jsx
function AvatarPicker() {
  const {onChange} = useField({name: 'avatar'});
  return <input type="file" accept="image/*" onChange={e => onChange(e.target.files?.[0])} />;
}
// getValues(form).avatar is now the File itself — on submit it is
// ready for the request body (FormData/multipart), no DOM read needed.
```

## Server-side Rendering

Form state lives in synchronously readable structures seeded from `initialValues`, and every subscription goes through `useSyncExternalStore` with a `getServerSnapshot` that computes the same snapshot as the client's first render. `renderToString` therefore renders form-driven components with their initial values out of the box, and `hydrateRoot` matches the server markup — no provider shims, no `typeof window` guards:

```jsx
import {renderToString} from 'react-dom/server';

// renders <input value="ada"> — then hydrates on the client without mismatches
const html = renderToString(<ProfileForm initialValues={{name: 'ada', city: 'london'}} />);
```

## Migrating

Coming from another library? [Migrating from TanStack Form](./docs/from-tanstack-form.md) is the repo-level concept map — core mapping table, known differences, common pitfalls. Step-by-step migration guides live in the docs site:

- [Migrating from Formik](docs-site/docs/migration/from-formik.md)
- [Migrating from React Hook Form](docs-site/docs/migration/from-react-hook-form.md)
- [Migrating from TanStack Form](docs-site/docs/migration/from-tanstack-form.md)

## Breaking changes in 1.0

- **`react >=18` peer.** The `use-sync-external-store` shim is gone — subscriptions use React's native `useSyncExternalStore`. The event emitter stopped being vendored: `src/emitter.ts` is now a facade over the `@for-fun/event-emitter` runtime dependency (external in ESM/CJS builds, so apps already depending on it dedupe the copy; the UMD bundle stays self-contained).
- **`reset` keep-flag split.** `keepIsSubmitted` now keeps the new `isSubmitted` flag (set on every submit attempt, cleared by reset — RHF's `formState.isSubmitted` semantics). Keeping the last submit's success flag is the new `keepIsSubmitSuccessful`. Previously `keepIsSubmitted` controlled `isSubmitSuccessful`; migration is a one-word rename for that use case.
- **`useFieldArray` unmount.** Unmounting the array now removes its branch by default (tombstone), exactly like a bound field — previously the values silently stayed. Keep them with `shouldUnregister: false` per array, or `createForm({shouldUnregister: false})` form-wide.
- **`setValue` functions are updaters.** `setValue(form, 'count', c => c + 1)` updates from the current value (TanStack's `setFieldValue` contract); a function can no longer itself be stored as a field value through `setValue`.

## Breaking changes in 0.2

v0.2 structures the error model (`FieldError`), changes unregister/reset/native-validation semantics, and more — see the [v0.1 → v0.2 migration guide](docs-site/docs/migration/v0.1-to-v0.2.md).
