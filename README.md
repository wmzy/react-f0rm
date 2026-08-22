# react-f0rm

[![CI](https://github.com/wmzy/react-f0rm/actions/workflows/ci.yml/badge.svg)](https://github.com/wmzy/react-f0rm/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/react-f0rm)](https://www.npmjs.com/package/react-f0rm)
[![bundle size](https://img.shields.io/bundlephobia/minzip/react-f0rm)](https://bundlephobia.com/package/react-f0rm)
[![License: ISC](https://img.shields.io/npm/l/react-f0rm)](https://opensource.org/licenses/ISC)

A headless, event-driven React form library with field-level subscriptions.

## Features

- **Field-level subscriptions.** Editing one field re-renders exactly that field's component, not the whole form. State is read through `useSyncExternalStore`, so snapshots stay consistent under concurrent rendering (no tearing).
- **Truly type-safe paths.** `FieldPath<T>` enumerates every valid field name for your values shape and `PathValue<T, P>` resolves the value type at that path — typos in field names fail at compile time, values are inferred.
- **One schema adapter for every library.** The Standard Schema resolver covers zod (v3.24+/v4), valibot v1, arktype and any other Standard Schema v1 implementation through a single tree-shakeable entry point.
- **Headless, with accessibility hooks.** You own the markup. When you opt into error rendering via `renderError`, `aria-invalid` and `aria-describedby` are wired up automatically.
- **Tombstone unregister.** Unmounted fields drop out of `getValues()` instead of silently reviving their initial values on the next read.
- **Copy-on-write `getValues()`.** An ownership-tracked merge allocates each container once per read instead of re-copying whole branches for every key.
- **Multiple errors per field.** Each field stores an ordered `FieldError[]` — `getFieldErrors`/`useFieldErrors` read them all, and schema resolvers forward every issue instead of stopping at the first.
- **Async validation with cancellation.** `validateDebounce` per field plus an `AbortSignal` handed to every validator: a superseded round aborts its in-flight fetch, and pending debounce windows count as validating so submit waits them out.
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

tinybench; relative margin of error ≤ 0.8% for the first three scenarios, ≤ 4.3% for the scale scenarios.

| Scenario | react-f0rm | Baseline | Speedup |
|---|---|---|---|
| Change one of 100 controlled fields | 96µs/change (~10,400 ops/s) | RHF `Controller`: 175µs (~5,730 ops/s) | ~1.8× |
| Components re-rendered per change | 1 of 100 `Field`s | — | — |
| `getValues()`, 100 fields × depth 3 | 40.4µs (ownership merge) | legacy chained `set`: 87.2µs | 2.16× |
| Change one of 1000 controlled fields | 0.358ms/change (~2,795 ops/s, rme ±0.7%) | RHF `Controller`: 1.465ms (~683 ops/s) | 4.0× |
| Async validation storm — burst of 3 changes × 50 debounced async validators, settled via `trigger` | 24.2ms/burst (~41 ops/s, rme ±4.3%) | — | — |
| `await trigger(form)` — 100 mixed validators (50 sync + 50 async) settle | 1.49ms (~669 ops/s, rme ±0.3%) | — | — |

Notes:

- For reference, RHF's uncontrolled `register` — which has no per-field re-render at all — floors at 20.4µs/change; the controlled comparison above uses `Controller`, the fair apples-to-apples baseline.
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
| Schema adapters | One Standard Schema entry point (`react-f0rm/resolvers/standard-schema`) covers zod, valibot, arktype, …; legacy zod/yup resolvers also shipped | `@hookform/resolvers` — one adapter module per validation library | Built-in `standardSchemaValidators` (Standard Schema v1), plus per-library adapter packages | Yup built in via `validationSchema`; other libraries hand-wired in `validate` |
| Path type safety | `FieldPath<T>` / `PathValue<T, P>`: every valid path enumerated, value type resolved, typos fail at compile time | `Path<T>` / `FieldPath` type-level path checking | Deep inference, including validator argument types — the strongest of the four | Top-level `keyof` only; nested paths are untyped strings |
| Async validation | `validateDebounce` per field + `meta.signal` (`AbortSignal`) handed to every validator — superseded rounds cancel their in-flight work; pending debounce counts as validating so submit waits | Async validators supported, but no built-in debounce and no cancellation signal — both are hand-rolled per project | Built in: `asyncDebounceMs` debounces and the validator meta carries an `AbortSignal` | Async `validate` supported; no debounce, no signal |
| Multiple errors per field | Native: every field holds `FieldError[]`; `getFieldErrors`/`useFieldErrors` read them; resolvers forward every schema issue | `criteriaMode: 'all'` collects all failing rules per field | Errors are arrays of messages per field | — |
| SSR / hydration | `renderToString` renders initial values out of the box; server snapshot matches the client's first render | SSR-safe | SSR-safe | SSR-safe |
| Bundle size | 5.16 KB brotli, full core (size-limit) | ~11 KB gzip | ~17.5 KB gzip | ~12.8 KB gzip |
| Devtools | `<Devtools />` from `react-f0rm/devtools` — separate entry point, tree-shakeable, never lands in the main bundle | `@hookform/devtools` (separate package) | Built-in devtools panel | None (official) |
| Ecosystem maturity | New, 0.x — small audience, few integrations so far | Most mature: massive adoption, resolvers, UI-kit integrations, abundant examples and answers | Backed by the TanStack family, actively growing | Maintenance mode; the author recommends considering RHF or Final Form for new projects |

### Which one should you use?

**Pick react-f0rm** when you want controlled components with true per-field subscriptions (design systems, editor-like forms), one Standard Schema adapter instead of a package per validator, compile-time-checked paths, and a ~5 KB core — and you are comfortable with a young 0.x library.

**Pick React Hook Form** when uncontrolled inputs are an option: its raw `register` performs no per-field re-render at all and floors at 20.4µs/change vs our 96µs (see [Benchmarks](#benchmarks)) — uncontrolled is simply a cheaper rendering model. RHF is also the right call when you need its mature ecosystem of resolvers, UI-library integrations and community answers today. TanStack Form sits in between: choose it when the deepest possible type inference (including validator signatures) matters more to you than bundle size.

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

Each call returns `{FormProvider, useFormContext, useField, useFieldArray}` bound to a private React context — pass the form via `<ProfileForm.FormProvider form={form}>`, and providers from separate instances never see each other's forms.

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

**`validateDebounce`** (on `Field`, `useField` or any bound component) delays a field's validation kicks by the given milliseconds; only the last kick inside the window runs the validator. While the timer is pending the field counts as *validating*, so `trigger` and submit wait the window out instead of racing it.

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

`setError` accepts a string, a `FieldError`, an array mixing both, or `undefined` to clear. Schema resolvers pass every issue through — a value breaking several rules collects all of them (Standard Schema/zod by design, yup via `abortEarly: false`) — and `getErrors()` contributes one entry per error.

### `setValue` options

The fourth argument to `setValue` opts into side effects. Every flag defaults to `false`; omitting the object keeps the plain set-value behavior:

```jsx
import {setValue} from 'react-f0rm';

setValue(form, 'email', 'a@b.com', {
  shouldValidate: true, // run the field's registered validator after the value lands
  shouldTouch: true,    // mark the field as touched
  shouldDirty: true     // reserved for a manual dirty marker — currently a no-op
});
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

## Accessibility

`Field` sets `aria-invalid` on the input whenever it has an error. Provide a `renderError(error, id)` function to render the message, and `Field` wraps it in `<span id={id} role="alert">` next to the input and points the input's `aria-describedby` at it:

```jsx
<Field
  name="email"
  renderError={error => <span className="field-error">{error}</span>}
/>
```

Without `renderError`, no extra element is rendered and no `aria-describedby` is attached — the headless default stays clean.

Native constraint validation (`required`, `type=email`, `minLength`, …) gates submission: `<Form>` runs the browser's `checkValidity()` before custom validators, and failing constraints surface as native validation bubbles via `reportValidity()`.

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
  // value is inferred as string; a typo like 'user.nmae' fails to compile
  const {value, onChange} = useField<Values, 'user.name'>({name: 'user.name'});
  return <input value={value} onChange={e => onChange(e.target.value)} />;
}
```

The same generics work on `getValue`/`setValue`/`getError` and the other path-taking helpers.

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

## Breaking changes in 0.2

v0.2 structures the error model (`FieldError`), changes unregister/reset/native-validation semantics, and more — see the [v0.1 → v0.2 migration guide](docs-site/docs/migration/v0.1-to-v0.2.md).
