# react-f0rm

[![CI](https://github.com/wmzy/react-f0rm/actions/workflows/ci.yml/badge.svg)](https://github.com/wmzy/react-f0rm/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/react-f0rm)](https://www.npmjs.com/package/react-f0rm)
[![bundle size](https://img.shields.io/bundlephobia/minzip/react-f0rm)](https://bundlephobia.com/package/react-f0rm)
[![License: ISC](https://img.shields.io/npm/l/react-f0rm)](https://opensource.org/licenses/ISC)

A headless, event-driven React form library with field-level subscriptions.

Coming from TanStack Form? [Migrating from TanStack Form](./docs/from-tanstack-form.md) is the one-page concept map — the core mapping table, known differences, and common pitfalls.

## Features

- **Field-level subscriptions.** Editing one field re-renders exactly that field's component, not the whole form. State is read through `useSyncExternalStore`, so snapshots stay consistent under concurrent rendering (no tearing).
- **Truly type-safe paths.** `FieldPath<T>` enumerates every valid field name for your values shape and `PathValue<T, P>` resolves the value type at that path — typos in field names fail at compile time, values are inferred.
- **One schema adapter for every library.** The Standard Schema resolver covers zod (v3.24+/v4), valibot v1, arktype and any other Standard Schema v1 implementation through a single tree-shakeable entry point.
- **Headless, with accessibility hooks.** You own the markup. When you opt into error rendering via `renderError`, `aria-invalid` and `aria-describedby` are wired up automatically.
- **Tombstone unregister.** Unmounted fields drop out of `getValues()` instead of silently reviving their initial values on the next read.
- **Copy-on-write `getValues()`.** An ownership-tracked merge allocates each container once per read instead of re-copying whole branches for every key.
- **Multiple errors per field.** Each field stores an ordered `FieldError[]` — `getFieldErrors`/`useFieldErrors` read them all, and schema resolvers forward every issue instead of stopping at the first.
- **Async validation with cancellation.** `validateDebounce` per field — and on the form-level `validate` — plus an `AbortSignal` handed to every validator: a superseded round aborts its in-flight fetch, and pending debounce windows count as validating so submit waits them out.
- **Precise lifecycle control.** `reset(form, values, {keepDirtyValues, …})` covers refetch-without-clobbering-dirty-drafts, `setFocus(form, name)` focuses programmatically, and `trigger(form, name?)` resolves `Promise<boolean>` once validation settles.
- **Typed, nestable form contexts.** `createFormContext<Values>()` gives each app area an isolated provider whose `useField`/`useFieldArray` take `FieldPath<Values>` names without hand-written generics.
- **SSR out of the box.** `renderToString` renders initial values and the server snapshot matches the client's first render, so hydration is consistent.
- Event-driven core with refined tree-shaking — you don't pay for features you don't use.

## Install

```sh
npm i react-f0rm
```
or
```
yarn add react-f0rm
```

## Benchmarks

tinybench; relative margin of error ≤ 0.9% for the first three scenarios, ≤ 2.5% for the scale scenarios.

| Scenario | react-f0rm | Baseline | Speedup |
|---|---|---|---|
| Change one of 100 controlled fields | 113µs/change (~8,880 ops/s) | RHF `Controller`: 200µs (~5,000 ops/s) | ~1.8× |
| Components re-rendered per change | 1 of 100 `Field`s | — | — |
| `getValues()`, 100 fields × depth 3 | 42.5µs (ownership merge) | legacy chained `set`: 93.0µs | 2.19× |
| Change one of 1000 controlled fields | 0.418ms/change (~2,390 ops/s, rme ±1.1%) | RHF `Controller`: 1.662ms (~602 ops/s) | 4.0× |
| Async validation storm — burst of 3 changes × 50 debounced async validators, settled via `trigger` | 20.5ms/burst (~49 ops/s, rme ±2.4%) | — | — |
| `await trigger(form)` — 100 mixed validators (50 sync + 50 async) settle | 1.48ms (~676 ops/s, rme ±0.9%) | — | — |

Notes:

- For reference, RHF's uncontrolled `register` — which has no per-field re-render at all — floors at 21µs/change; the controlled comparison above uses `Controller`, the fair apples-to-apples baseline.
- In the `getValues()` benchmark, ownership merging also cut container allocations from 300 to 111.

Reproduce with:

```sh
npx vitest bench --run test/bench/render.bench.ts test/bench/getValues.bench.ts
npx vitest bench --run test/bench/scale.bench.ts   # the three scale scenarios above
```

## Comparison

react-f0rm vs the established options. react-f0rm figures come from this repo (size-limit, tinybench — see [Benchmarks](#benchmarks)); competitor sizes are Bundlephobia gzip observations and drift between versions, so treat them as ballpark rather than gospel.

| | react-f0rm | React Hook Form | TanStack Form | Formik |
|---|---|---|---|---|
| Rendering model | Controlled fields with field-level subscriptions (`useSyncExternalStore`): editing one of 100 fields re-renders exactly 1 component | Uncontrolled `register` by default (no React re-render while typing); `Controller` opts into per-field re-renders | Field-level subscriptions (`form.Field` / `useField`), each field re-renders itself | Form-wide context: any state change re-renders all subscribed components |
| Unregister on unmount | Unregisters by default — an unmounted field drops out of `getValues()` (tombstone) instead of silently reviving its initial value; `shouldUnregister: false` keeps it | Value kept by default (`shouldUnregister` defaults to `false`); opt in per field or form to unregister on unmount | Values live in the form store; unmounting a field's UI keeps its value and state | No unregister concept — values persist until `reset` |
| Schema adapters | One Standard Schema entry point (`react-f0rm/resolvers/standard-schema`) covers zod, valibot, arktype, …; legacy zod/yup resolvers also shipped | `@hookform/resolvers` — one adapter module per validation library | Built-in `standardSchemaValidators` (Standard Schema v1), plus per-library adapter packages | Yup built in via `validationSchema`; other libraries hand-wired in `validate` |
| Path type safety | `FieldPath<T>` / `PathValue<T, P>`: every valid path enumerated, value type resolved, typos fail at compile time | `Path<T>` / `FieldPath` type-level path checking | Deep inference, including validator argument types — the strongest of the four | Top-level `keyof` only; nested paths are untyped strings |
| Async validation | `validateDebounce` per field + `meta.signal` (`AbortSignal`) handed to every validator — superseded rounds cancel their in-flight work; pending debounce counts as validating so submit waits | Async validators supported, but no built-in debounce and no cancellation signal — both are hand-rolled per project | Built in: `asyncDebounceMs` debounces and the validator meta carries an `AbortSignal` | Async `validate` supported; no debounce, no signal |
| Multiple errors per field | Native: every field holds `FieldError[]`; `getFieldErrors`/`useFieldErrors` read them; resolvers forward every schema issue | `criteriaMode: 'all'` collects all failing rules per field | Errors are arrays of messages per field | — |
| SSR / hydration | `renderToString` renders initial values out of the box; server snapshot matches the client's first render | SSR-safe | SSR-safe | SSR-safe |
| React 19 / Server Actions | Bridge pattern: dispatch the action from `onValidSubmit` via `startTransition`/`useActionState`, passing the values object rather than FormData (see the stance above and the React 19 Server Actions guide); no submit before JS loads — first-class `action` prop support is not on the 0.x roadmap | `<Form>` accepts a function `action` prop (server-action-style submit) since v7.84, and ships a `react-server` export | Documented server action integration (`createServerValidate` for server-side validation, Next.js examples) | — |
| Bundle size | 11.18 KB gzip (7.1 KB brotli, minified), full core | ~11 KB gzip | ~17.5 KB gzip | ~12.8 KB gzip |
| Devtools | `<Devtools />` from `react-f0rm/devtools` — separate entry point, tree-shakeable, never lands in the main bundle | `@hookform/devtools` (separate package) | Built-in devtools panel | None (official) |
| Ecosystem maturity | New, 0.x — small audience, few integrations so far | Most mature: massive adoption, resolvers, UI-kit integrations, abundant examples and answers | Backed by the TanStack family, actively growing | Maintenance mode; the author recommends considering RHF or Final Form for new projects |

Bundle-size basis: every column is gzip. react-f0rm is measured on the local build — gzip of the shipped, unminified `dist/index.mjs` after `npm run build` (minified, the same file gzips to ~7.88 KB; 7.1 KB brotli via size-limit, which minifies and tree-shakes). Competitor figures are Bundlephobia observations of minified+gzip bundles — so ours is the conservative number, not the flattering one.

### Which one should you use?

**Pick react-f0rm** when you want controlled components with true per-field subscriptions (design systems, editor-like forms), one Standard Schema adapter instead of a package per validator, compile-time-checked paths, and a small core (11.18 KB gzip / 7.1 KB brotli) — and you are comfortable with a young 0.x library.

**Pick React Hook Form** when uncontrolled inputs are an option: its raw `register` performs no per-field re-render at all and floors at 21µs/change vs our 113µs (see [Benchmarks](#benchmarks)) — uncontrolled is simply a cheaper rendering model. RHF is also the right call when you need its mature ecosystem of resolvers, UI-library integrations and community answers today. TanStack Form sits in between: choose it when the deepest possible type inference (including validator signatures) matters more to you than bundle size.

**Server Actions: bridge, not first-class.** RHF-style `action` prop support, a `react-server` entry point, or a TanStack-style `createServerValidate` helper are **not on the 0.x roadmap** — a deliberate stance, not a gap. react-f0rm's source of truth is the values store, not the DOM: an `action`-prop submit would ship FormData keyed by JSON-stringified path keys, drop every store-only value, and skip the validation gate entirely (the [React 19 Server Actions guide](docs-site/docs/guides/react19-server-actions.md) unpacks all four failure modes). The recommended shape is the bridge — dispatch from `onValidSubmit` via `startTransition`/`useActionState`, passing the values object rather than FormData — which keeps validation gating the action and types/nesting intact. If submitting without JavaScript loaded is a hard requirement, RHF's `action` prop support is the better fit today.

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
| `event` | `'change'` \| `'errors'` \| `'touched'` \| `'submitting'` \| `'submitCount'` | `'change'` |
| `scope` | `'leaf'` \| `'branch'` | `'branch'` |
| `callback` | `() => void`, fired with no arguments | required |

Matching follows the event's shape. `'change'` walks the path tree: the default `'branch'` scope wakes a `'tags'` subscriber when any `tags.*` descendant is written, while `'leaf'` matches only the exact key and its ancestors. `'errors'` and `'touched'` always match the exact key — another field's error never wakes this subscriber. `'submitting'`/`'submitCount'` are payload-less, so a `name` narrows nothing. An array of names creates one subscription per path, and the returned function unsubscribes them all. A number-bearing array (`['tags', 0]`) is one segments path, not a name list — the same rule `trigger` uses.

**`subscribe` vs `useWatch`:** `useWatch` (and the `useValue`/`useError`/… readers built on it) feeds rendering — it returns a snapshot and re-renders the component when it changes. `subscribe` runs imperative code and renders nothing. Use `subscribe` for linkages and effects; reach for a hook only when the watched value itself must appear on screen.

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

Besides the movers (`append`, `prepend`, `insert`, `remove`, `swap`, `move`), two bulk operations are available:

```jsx
const {fields, replace, update} = useFieldArray({name: 'tags'});

replace(['a', 'b', 'c']); // full swap: every row id is regenerated (length may change)
update(1, 'B');           // overwrite one value, keeping that row's id — no key churn
```

`replace(values)` is the refetch shape — a server response replaces the whole list — while `update(index, value)` rewrites a single row in place.

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

### Async validation

Async validators are first-class. Two knobs keep them cheap and race-free:

**`validateDebounce`** (on `Field`, `useField` or any bound component) delays a field's validation kicks by the given milliseconds; only the last kick inside the window runs the validator. While the timer is pending the field counts as *validating*, so `trigger` and submit wait the window out instead of racing it. The form-level `validate` gets the same contract through `validateDebounce` on `createForm`/`useForm` (see [Form-level validation](#form-level-validation)).

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

`setError` accepts a string, a `FieldError`, an array mixing both, or `undefined` to clear. Schema resolvers pass every issue through — a value breaking several rules collects all of them (Standard Schema/zod by design, yup via `abortEarly: false`) — and `getErrors()` contributes one entry per error. For imperative clears, `clearErrors(form)` wipes every error while `clearErrors(form, name)` — one name or an array of names — clears only those fields.

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

Committed baselines follow the form's lifecycle: `reset`, `setInitialValues` and `resetField`/`removeField` drop them (the state they measured against is gone), and a wholesale write at an ancestor path — a `useFieldArray` rewrite, say — drops baselines beneath it, since the subtree they were committed against no longer exists.

### Writing as a user change (`changeValue`)

`setValue` is the imperative channel — `shouldValidate` kicks the field's validator unconditionally, ignoring any mode. `changeValue` is the user-change channel: the write routes through the mounted field's own `onChange`, so it fires exactly the validation a user typing into the field would fire — the field's effective `mode` (per-field override included) and the form's `reValidateMode`. With no mounted field on the path it degrades to a plain `setValue`.

```jsx
import {changeValue} from 'react-f0rm';

// An onSubmit form with the default reValidateMode 'onChange': quiet
// while the field has no error, re-validates once it does — same as typing.
changeValue(form, 'email', 'a@b.com');
```

This is the channel component libraries need when they hand a control a plain setter bound to a field (a `Control`/controlled-bridge over `useField`'s value): the mode gating — per-field override and live-error view — lives inside `useField`'s `onChange` closure and cannot be rebuilt from public form state, so `useField` publishes its `onChange` on the form (`form.changeHandlers`) and `changeValue`/`changeValueByPath` route through it.

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

The optional top-level `messages` record overrides messages per rule type (`min`, `max`, `minLength`, `maxLength`, `pattern`) — useful for centralizing or localizing them.

Semantics:

- A failing `required` short-circuits the rest — an empty value reports only its `required` error, not a full panel.
- Every other failing rule collects into one ordered `FieldError[]` (see [Multiple errors per field](#multiple-errors-per-field)).
- `rules` composes with `validate`: rules run first, then `validate` (awaited when async), merging both sources' errors with rules ahead.
- Rules ride the exact same pipeline as `validate` — `mode`, `reValidateMode`, `validateDebounce` and `meta.signal` all apply unchanged.

Rules vs native constraints: HTML attributes (`required`, `type="email"`, `min`, …) keep running through the browser's `checkValidity`, whose bubble remains the pre-submit fallback. `rules` is the state-side alternative — failures are queryable (`getErrors`, `error`, `errors`), renderable by any UI, and carry your own messages. Prefer `rules` whenever the error text must be controlled.

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

### Seeding new initial values

`setInitialValues(form, values)` swaps the baseline by **content**, not reference: passing a fresh object with equal content (the inline literal a re-render recreates) is a no-op — committed edits survive — while genuinely changed content re-seeds: live values and tombstones are cleared, touched flags and errors survive. Same value semantics `useForm({initialValues})`/`<Form initialValues>` sync with, so the editor-page shape works without memoizing the literal or double-passing it:

```jsx
const article = useData<Article>() ?? undefined;
// No useMemo needed: a new object per render with equal content never
// clears what the user typed; switching to another article re-seeds.
const form = useForm({initialValues: articleToValues(article)});
```

### Resetting

`reset(form, initialValues?)` wipes values, errors, touched, tombstones and the submission flags (`isSubmitting`, `submitCount`, `isSubmitSuccessful`). The second argument installs a fresh baseline. The third opts into keeping slices of state through the reset:

```jsx
import {reset} from 'react-f0rm';

reset(form, freshRecord);                  // full reset to the new baseline
reset(form, freshRecord, {keepDirtyValues: true});  // dirty drafts survive
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

## TypeScript

`FieldPath<T>` and `PathValue<T, P>` make field names and value types compile-time checked:

```tsx
import {FieldPath, PathValue, useField} from 'react-f0rm';

interface Values {
  user: {name: string};
  tags: string[];
}

// 'user' | 'user.name' | 'tags' | `tags.0` | `tags[0]` | ...
type ValuesPath = FieldPath<Values>;

// string
type UserName = PathValue<Values, 'user.name'>;

function UserNameField() {
  // value is inferred as string; an unknown path degrades to `any`
  // (PathValueOf), keeping dynamic names usable
  const {value, onChange} = useField<Values, 'user.name'>({name: 'user.name'});
  return <input value={value} onChange={e => onChange(e.target.value)} />;
}
```

The same generics work on `getValue`/`setValue`/`getError` and the other path-taking helpers.

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

## Breaking changes in 0.2

v0.2 structures the error model (`FieldError`), changes unregister/reset/native-validation semantics, and more — see the [v0.1 → v0.2 migration guide](docs-site/docs/migration/v0.1-to-v0.2.md).
