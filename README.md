# react-f0rm

A headless, event-driven React form library with field-level subscriptions.

## Features

- **Field-level subscriptions.** Editing one field re-renders exactly that field's component, not the whole form. State is read through `useSyncExternalStore`, so snapshots stay consistent under concurrent rendering (no tearing).
- **Truly type-safe paths.** `FieldPath<T>` enumerates every valid field name for your values shape and `PathValue<T, P>` resolves the value type at that path — typos in field names fail at compile time, values are inferred.
- **One schema adapter for every library.** The Standard Schema resolver covers zod (v3.24+/v4), valibot v1, arktype and any other Standard Schema v1 implementation through a single tree-shakeable entry point.
- **Headless, with accessibility hooks.** You own the markup. When you opt into error rendering via `renderError`, `aria-invalid` and `aria-describedby` are wired up automatically.
- **Tombstone unregister.** Unmounted fields drop out of `getValues()` instead of silently reviving their initial values on the next read.
- **Copy-on-write `getValues()`.** An ownership-tracked merge allocates each container once per read instead of re-copying whole branches for every key.
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

tinybench, all results with relative margin of error ≤ 0.73%.

| Scenario | react-f0rm | Baseline | Speedup |
|---|---|---|---|
| Change one of 100 controlled fields | 110µs/change (~9,000 ops/s) | RHF `Controller`: 177µs (~5,650 ops/s) | ~1.6× |
| Components re-rendered per change | 1 of 100 `Field`s | — | — |
| `getValues()`, 100 fields × depth 3 | 41.4µs (ownership merge) | legacy chained `set`: 87.8µs | 2.12× |

Notes:

- For reference, RHF's uncontrolled `register` — which has no per-field re-render at all — floors at 20.8µs/change; the controlled comparison above uses `Controller`, the fair apples-to-apples baseline.
- In the `getValues()` benchmark, ownership merging also cut container allocations from 300 to 111.

Reproduce with:

```sh
npx vitest bench --run test/bench/
```

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
  const {value, onChange, onBlur, error, errorObject} = useField({name});
  return (
    <div>
      <input value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
```

`error` is the error's message string (or `undefined`); `errorObject` is the full structured error `{type, message}`. Pass an explicit `form` to use the hook outside a `<Form>`:

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

Whenever the `values` reference changes, the new object is synced into the form: uncommitted user edits are discarded — master-detail semantics, where selecting another record replaces the draft — while touched flags and errors are kept. The sync is reference-based: re-renders that pass the same `values` reference never re-sync, so a stable reference never interrupts what the user is typing.

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

Validators may be asynchronous — `trigger` kicks them off and returns immediately; errors land once they settle.

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

## Breaking changes in 0.2

v0.2 structures the error model (`FieldError`), changes unregister/reset/native-validation semantics, and more — see the [v0.1 → v0.2 migration guide](docs-site/docs/migration/v0.1-to-v0.2.md).
