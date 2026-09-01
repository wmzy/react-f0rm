# Migrating from TanStack Form

react-f0rm and TanStack Form agree on the fundamentals: both are controlled-render form
libraries where each field holds its own subscription and re-renders itself, not the whole
form. The wiring differs: TanStack hands you a form **store** read through render-prop
field components (`form.Field` / `form.AppField`) and selector subscriptions
(`form.Subscribe`, `useSelector`); react-f0rm is a headless **event core** (`createForm` /
`useForm`) read through field-level subscription hooks (`useField`, `useValue`,
`useError`, …) bound with `useSyncExternalStore`, with `<Field>` / `<Form>` as the
controlled components on top. Your inputs stay controlled either way — you just stop
writing render props and selectors. The
[docs-site guide](../docs-site/docs/migration/from-tanstack-form.md) covers the same
ground step by step.

## The core mapping

| TanStack Form v1 | react-f0rm | Notes |
| --- | --- | --- |
| `useForm` / `useAppForm` | `useForm({initialValues})` or `createForm({…})` | `useForm` is `createForm` held in a `useState`; the factory works outside React (React Native, tests). |
| `defaultValues` | `initialValues` | `setInitialValues(form, values)` re-seeds by content, not reference. |
| `onSubmit: async ({value})` form option | `onValidSubmit(values, e)` | Runs only after validation passes; `onInvalidSubmit(errors, values)` receives `{path, type, message}` entries. |
| `form.handleSubmit()` behind a hand-written `e.preventDefault()` | `<Form>` binds submit itself; `handleSubmit(form, {…})` headless | No `preventDefault`/`stopPropagation` choreography; the headless form takes the handler map as its second argument and runs the same submit state machine. |
| `form.Field` / `form.AppField` render props | `<Field name="email" />` or `useField({name})` | `<Field>` renders the input; `useField` returns the controlled triple `{value, onChange, onBlur}` plus error state. |
| `validators: {onChange, onBlur, onSubmit}` | one `validate` (and declarative `rules`) + `mode` / `reValidateMode` | Any field may declare its own `mode`; see below. |
| `asyncDebounceMs` / `onChangeAsyncDebounceMs` | `validateDebounce` | Debounces the field's whole pipeline — rules + validate, sync or async. The form-level `validate` takes one too. |
| validator receives `{value, fieldApi, signal}` | validator receives `(value, {form, path, signal})` | Same abort-on-supersede contract; pass `signal` to `fetch`. |
| `standardSchemaValidators` | `standardSchemaFormValidator(schema)` / `standardSchemaResolver(schema)` | Separate entry point `'react-f0rm/resolvers/standard-schema'`, tree-shakeable. |
| `form.Subscribe` / `useSelector(form.store, selector)` | `useValue` / `useError` / `useDirtyFields` / `useWatch(form.emitter, event, getter)` | Hooks re-render the calling component; no custom `compare`. |
| array `form.Field` + `pushValue` / `removeValue` / `insertValue` / `swapValues` / `moveValue` | `useFieldArray({name})` → `append` / `prepend` / `insert` / `remove` / `swap` / `move` / `update` / `replace` | `replaceValue(i, v)` → `update(i, v)`; rows carry stable ids. |
| `state.canSubmit` | `useCanSubmit(form)` | Composite `!isSubmitting && !hasErrors`; parts stay exported (`useIsSubmitting`, `useHasErrors`, `useSubmitCount` — also the mappings for `state.isSubmitting` / `state.submissionAttempts`). |
| `form.setErrorMap` / validator returning `{form, fields}` | `setServerErrors(form, {field: message})`, `setError(form, name, …)` | The server channel stores `type: 'server'` errors from the flat REST record shape. |
| `form.validate()` | `trigger(form, name?)` | Resolves `Promise<boolean>` once async validators and debounce windows settle. |
| `form.setFieldValue` | `setValue(form, name, value, {shouldValidate})` / `changeValue(form, name, value)` | `shouldValidate: true` kicks the validator unconditionally; `changeValue` routes through the mounted field's `onChange` — the validation a user typing would fire. |
| deeply inferred paths (`people[0].name`) | `FieldPath<T>` / `PathValue<T, P>` | Dotted or segment paths (`['people', 0, 'name']`); typos fail at compile time. |

## Forms and submission

```tsx
// Before: the form hook owns submission, you own the <form> element
const form = useForm({
  defaultValues: {email: ''},
  onSubmit: async ({value}) => api.register(value),
});

<form onSubmit={e => {e.preventDefault(); e.stopPropagation(); form.handleSubmit();}}>
  {/* fields */}
</form>

// After: <Form> owns the element and the submit machinery
const form = useForm({initialValues: {email: ''}});

<Form form={form} onValidSubmit={values => api.register(values)}>
  <Field name="email" />
  <button type="submit">Register</button>
</Form>
```

`<Form>` runs native constraint validation (`checkValidity`) before your validators,
focuses the first errored field after a failed submit (`shouldFocusError`, default
`true`), and keeps `isSubmitting` up across the awaited handler. Outside a `<form>`
element, `handleSubmit(form, {onSubmit, onValidSubmit, onInvalidSubmit})` runs the same
flow, invoked with or without an event object.

## Field binding

```tsx
// Before: a render prop per field
<form.AppField
  name="username"
  validators={{onChange: ({value}) => (value.length > 2 ? undefined : 'Too short')}}
  children={field => (
    <input
      name={field.name} value={field.state.value} onBlur={field.handleBlur}
      onChange={e => field.handleChange(e.target.value)} />
  )}
/>

// After: the component renders the input; the validator rides `mode`
<Field name="username" validate={v => (v.length > 2 ? undefined : 'Too short')} />

// …or take the controlled triple yourself
const {value, onChange, onBlur, error} = useField({name: 'username'});
```

Both re-render exactly the changed field — TanStack through the store subscription each
render-prop field opens, react-f0rm through an internal `useSyncExternalStore` binding
per field. Custom components render via `as` (`<Field as={TextArea} />`) or build on
`useField`; `createFormContext<Values>()` replaces `withForm` for sharing a typed form.

## Validation timing

```tsx
// Before: a function per event, async twins debounced per validator
<form.Field name="email" validators={{
  onChangeAsyncDebounceMs: 300,
  onChangeAsync: async ({value, signal}) => {
    const res = await fetch(`/api/check-email?email=${encodeURIComponent(value)}`, {signal});
    return (await res.json()).taken ? 'Email already registered' : undefined;
  },
}} />

// After: one validate; mode decides when; debounce covers the pipeline
<Field name="email" mode="onChange" validateDebounce={300}
  validate={async (value, {signal}) => {
    const res = await fetch(`/api/check-email?email=${encodeURIComponent(value)}`, {signal});
    return (await res.json()).taken ? {type: 'taken', message: 'Email already registered'} : undefined;
  }} />
```

`validators: {onChange}` becomes `mode="onChange"` + `validate`; `{onBlur}` becomes
`mode="onBlur"` (or `'onTouched'`: first blur, then change); `{onSubmit}` is the
default `mode: 'onSubmit'`. A sync + async pair collapses into one `validate`, and a
pending debounce window counts as validating, so submit waits it out. Once a field
holds an error, re-validation follows the form-level `reValidateMode` (default
`'onChange'`) regardless of the field's own `mode`; `trigger(form, 'email')` is the
manual `form.validate()` (form-wide without a name).

## Schema validation

```tsx
// Before: a Standard Schema goes straight into validators
const form = useForm({defaultValues: {email: ''}, validators: {onChange: schema}});

// After: one adapter, two levels, its own entry point
import {standardSchemaFormValidator, standardSchemaResolver} from 'react-f0rm/resolvers/standard-schema';

const form = useForm({
  initialValues: {email: ''},
  validate: standardSchemaFormValidator(schema) // issue paths → field errors, pathless → '_form'
});

<Field name="email" validate={standardSchemaResolver(z.string().email())} />
```

Issues land as `{type: 'standard', message}` in each field's `FieldError[]`, every issue kept.
On success the parsed output becomes the `parsedValues` baseline: `getValues()` and submit
callbacks read coerced values (`z.coerce.number()` → real `number`), live user edits still
win, and dirty state keeps comparing against `initialValues`; `reset()` / `setInitialValues()`
clear the baseline.

## Array fields

```tsx
// Before: an array field plus index-keyed subfields
<form.Field name="tags">
  {field => (
    <>
      {field.state.value.map((_, i) => (
        <form.Field key={i} name={`tags[${i}]`} children={sub => (
          <input value={sub.state.value} onChange={e => sub.handleChange(e.target.value)} />
        )} />
      ))}
      <button type="button" onClick={() => field.pushValue('')}>Add</button>
    </>
  )}
</form.Field>

// After: one hook; rows carry stable ids, so reorders keep component state
const {fields, append, remove} = useFieldArray({name: 'tags'});

{fields.map((field, index) => (
  <div key={field.id}>
    <Field name={['tags', index]} />
    <button type="button" onClick={() => remove(index)}>Remove</button>
  </div>
))}
<button type="button" onClick={() => append('')}>Add</button>
```

`pushValue` → `append`, `removeValue` → `remove`, `insertValue` → `insert`, `swapValues` →
`swap`, `moveValue` → `move`, `replaceValue(i, v)` → `update(i, v)` (keeps the row id).
Extras: `prepend(v)` and `replace(values)` — the full-list swap that regenerates every row
id, the refetch shape. Nested paths are dotted strings or segment arrays, both
`FieldPath<Values>`-checked.

## Subscriptions

```tsx
// Before: selectors over the form store
<form.Subscribe selector={s => s.values.province}
  children={province => <CityOptions province={province} />} />

// After: named hooks re-render the calling component
const firstName = useValue(form, 'firstName');
const dirty = useDirtyFields(form);           // {'user.name': true, 'tags.0': true}

// useWatch projects any getter over a form event
const province = useWatch(form.emitter, 'change', () => getValue(form, 'province'));

// For linked fields and non-render effects — TanStack's `listeners` —
// subscribe runs imperative code without a mounted component:
const unsubscribe = subscribe(form, {
  name: 'province',
  callback: () => {
    if (getValue(form, 'city')) setValue(form, 'city', '');
  }
});
```

`event` picks `'change' | 'errors' | 'touched' | 'submitting' | 'submitCount'`; on
`'change'`, `scope: 'branch'` (default) wakes the subscriber when any descendant of
`name` is written, `'leaf'` the exact key. No `form.Subscribe` equivalent re-renders
children without re-rendering the owner — keep reader components small.

## Known differences

- **Tombstone unregister.** react-f0rm unregisters a field on unmount — its value drops out of `getValues()` instead of silently reviving its initial value. Pass `shouldUnregister: false` to keep it. TanStack keeps every value in the store regardless of unmounting.
- **Per-field mode override.** Timing lives in one declarative place: `<Field mode="onBlur">` replaces the form's `mode` for that field only (`field.mode ?? form.mode`); `reValidateMode` stays form-level for everyone. TanStack attaches validators per event instead — same expressiveness, different axis.
- **Field-level subscription granularity.** react-f0rm hooks subscribe at field granularity automatically through `useSyncExternalStore` — `useValue(form, 'email')` re-renders only when `email` or its ancestors change. TanStack asks you to open the subscription yourself with a selector (`useSelector(form.store, s => s.values.email)`); arbitrary-slice selectors with custom `compare` have no counterpart.
- **Type inference depth.** TanStack infers from `defaultValues` all the way into validator argument types — the deepest of the form libraries. react-f0rm checks paths with `FieldPath<T>` / `PathValue<T, P>` and infers `validate`'s argument on a typed form (via the `form` prop, `useFormContext<Values>()` or `createFormContext<Values>()`); on an untyped form both degrade to `any`.
- **Dirty semantics.** react-f0rm compares live values against `initialValues` — edit a field and revert it, and the field is clean again. TanStack keeps a changed-then-reverted field dirty; its `isDefaultValue` meta is the opt-out. Schema parsing (`parsedValues`) never marks a field dirty.
- **Parsed output.** TanStack does not preserve a schema's transformed output — re-parse inside `onSubmit` for coerced values. react-f0rm's form-level adapter stores the parsed output as a baseline; `getValues()` and submit callbacks read it for any field without a live edit.

## Common pitfalls

- **`defaultValues` → `initialValues`.** Same seed, different name; a silent `<Form defaultValues>` renders empty fields.
- **`onSubmit({value})` → `onValidSubmit(values, e)`.** react-f0rm's own `onSubmit` option is a different thing — a pre-step on the success path that runs ahead of `onValidSubmit`. Port the TanStack `onSubmit` body to `onValidSubmit`; the failure branch is `onInvalidSubmit(errors, values)`.
- **No manual `preventDefault`/`stopPropagation`.** `<Form>` binds the submit handler itself; hand-rolling the `<form onSubmit>` wrapper fights it. Reach for `handleSubmit(form, …)` only where there is no `<form>` element — and note it takes the handler map as its second argument, unlike `form.handleSubmit()`.
- **Schema adapter import path.** `standardSchemaFormValidator` / `standardSchemaResolver` live in `'react-f0rm/resolvers/standard-schema'`, a separate entry point — importing them from the package root won't resolve. Legacy `zodResolver` / `yupResolver` ship from `react-f0rm/resolvers/zod` and `/yup`.
- **Submit button state.** Use `useCanSubmit(form)` — the composite `!isSubmitting && !hasErrors` flag (`setServerErrors` backfill lands there too). Deliberately no dirty semantics: an untouched-but-clean form can submit; fold in `useIsDirty(form)` yourself if you want "must change something first".
