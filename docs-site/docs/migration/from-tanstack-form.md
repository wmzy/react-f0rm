---
sidebar_position: 3
---

# Migrating from TanStack Form

This guide maps TanStack Form v1 (`@tanstack/react-form`) concepts to react-f0rm piece by piece. Every react-f0rm snippet uses the real public API — the same compositions are exercised by the repo's doc-example tests.

## Key Differences

| Feature | TanStack Form v1 | react-f0rm |
|---------|------------------|------------|
| Form creation | `useForm` / `useAppForm` (hook-held instance, `defaultValues`) | `createForm` (headless factory) + `useForm` (hook), `initialValues` |
| Submission | `onSubmit` option on the form, `form.handleSubmit()` | `onValidSubmit` on `<Form>` or the headless `handleSubmit(form, …)` |
| Field binding | `form.Field` / `form.AppField` render props, `field.handleChange` | `<Field name>` straight to `<input>`, or `useField` for a controlled triple |
| Validation timing | Per-event validator callbacks (`validators.onChange/onBlur/onSubmit`) | One `validate` per field + `mode` / `reValidateMode` controlling when it runs |
| Async debounce | `asyncDebounceMs` / `onChangeAsyncDebounceMs` (async validators only) | `validateDebounce` on the whole field pipeline (rules + validate, sync + async) |
| Schema validation | Pass a Standard Schema directly to `validators` (adapters deprecated) | `standardSchemaResolver` (field) + `standardSchemaFormValidator` (form) |
| Parsed schema output | Not preserved — parse again inside `onSubmit` | Kept as the `parsedValues` baseline — `getValues()` reads coerced values |
| Subscriptions | `form.Subscribe` (component-local re-render) + `useSelector(form.store, selector)` | Named hooks (`useValue`, `useError`, …) that re-render the calling component; `subscribe` for imperative effects |
| Submit button state | `state.canSubmit` composite flag | No `canSubmit` — compose `useHasErrors` / `useIsDirty` / `useIsSubmitting` |
| Server errors | Validator returning `{form, fields}`, or `form.setErrorMap` | `setServerErrors(form, {field: message})` — one channel, `type: 'server'` |
| Arrays | `mode="array"` + `field.pushValue/removeValue/…` | `useFieldArray` + `append/remove/insert/swap/move/replace/update`, stable row ids |
| Paths | String paths, deeply inferred types (`people[0].name`) | `FieldPath<T>`-checked dotted or segment paths (`['people', 0, 'name']`) |
| Dirty semantics | Persistent: changed-then-reverted stays dirty (`isDefaultValue` opts out) | Value comparison: reverting to `initialValues` makes the field clean again |

## Migration Steps

### 1. `useAppForm` → `useForm` / `createForm`

TanStack creates the form inside a hook and wires submission through its options:

```tsx
// Before: TanStack Form v1
import {useForm} from '@tanstack/react-form';

function Register() {
  const form = useForm({
    defaultValues: {email: '', password: ''},
    onSubmit: async ({value}) => {
      await api.register(value);
    },
  });

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      {/* fields */}
    </form>
  );
}
```

react-f0rm splits the same concerns: `createForm`/`useForm` holds state (`initialValues` instead of `defaultValues`), and `<Form>` owns the `<form>` element plus the submit machinery — validation gating, focus-on-error, `isSubmitting` across the awaited handler:

```tsx
// After: react-f0rm
import {Form, Field, useForm} from 'react-f0rm';

function Register() {
  const form = useForm({initialValues: {email: '', password: ''}});

  return (
    <Form form={form} onValidSubmit={values => api.register(values)}>
      <Field name="email" />
      <Field name="password" type="password" />
      <button type="submit">Register</button>
    </Form>
  );
}
```

Notes:

- `createForm({initialValues})` is the headless counterpart — usable outside React (React Native, tests). `useForm` is just `createForm` held in a `useState` so re-renders keep one instance.
- TanStack's `onSubmit({value})` maps to `onValidSubmit(values, e)` (runs only after validation passes). `onSubmit` also exists on `<Form>`/`handleSubmit` but fires before `onValidSubmit` as a pre-step; `onInvalidSubmit(errors, values)` receives `{path, type, message}` entries.
- No `preventDefault` choreography: `<Form>` binds the submit handler itself.

### 2. `form.AppField` field suites → `Field` / `useField`

TanStack's field components are render-prop based and always controlled:

```tsx
// Before: TanStack Form v1
<form.AppField
  name="username"
  validators={{
    onChange: ({value}) => (value.length > 2 ? undefined : 'Too short'),
  }}
  children={field => (
    <input
      name={field.name}
      value={field.state.value}
      onBlur={field.handleBlur}
      onChange={e => field.handleChange(e.target.value)}
    />
  )}
/>
```

react-f0rm's `<Field>` renders the input directly (the validator below rides the form's `mode`):

```tsx
// After: react-f0rm
<Field name="username" validate={value => (value.length > 2 ? undefined : 'Too short')} />
```

For full control, `useField` returns the controlled triple plus the error state — the value type is inferred from the typed form:

```tsx
// After: react-f0rm
import {useField, type FormInstance} from 'react-f0rm';

function UsernameField({form}: {form: FormInstance<Values>}) {
  const {value, onChange, onBlur, error} = useField({form, name: 'username'});
  return (
    <div>
      <input value={value} onBlur={onBlur} onChange={e => onChange(e.target.value)} />
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
```

> `Form` from the package entry is the component value, not a type — the form-instance interface ships under the `FormInstance` alias.

Both libraries re-render exactly the field that changed; the difference is the plumbing: TanStack subscribes through signals you select manually, react-f0rm wires field-level subscriptions through `useSyncExternalStore` internally.

**Rendering into a design system.** TanStack's `createFormHook` registers reusable `fieldComponents` (`<field.TextField />`) and composes big forms with `withForm`. react-f0rm composes with UI kits directly — the haze-ui `FormItem`, for example, already speaks react-f0rm: it takes `form`/`name`/`validate` and hands your control the wiring (id, error id, `aria-invalid`, blur):

```tsx
// After: react-f0rm + haze-ui FormItem
import {FormItem} from 'haze-ui';

<FormItem form={form} name="email" mode="onBlur" validate={checkEmail}>
  {({id, errorId, invalid, control, onBlur}) => (
    <Input
      id={id}
      value={control}
      type="email"
      aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined}
      onBlur={onBlur}
    />
  )}
</FormItem>
```

There is no `withForm` equivalent — split big forms by passing the `form` instance to child components (or share it through `createFormContext<Values>()`'s typed provider).

### 3. Field validators: `validators` + `onChangeAsyncDebounceMs` → `validate` + `mode` + `validateDebounce`

TanStack assigns a function per event, with async twins and per-validator debounce:

```tsx
// Before: TanStack Form v1
<form.Field
  name="email"
  asyncDebounceMs={500}
  validators={{
    onChange: ({value}) => (value.includes('@') ? undefined : 'Invalid email'),
    onChangeAsyncDebounceMs: 300,
    onChangeAsync: async ({value, signal}) => {
      const res = await fetch(`/api/check-email?email=${encodeURIComponent(value)}`, {signal});
      const {taken} = await res.json();
      return taken ? 'Email already registered' : undefined;
    },
  }}
/>
```

react-f0rm has one `validate` (sync or async, both allowed) and a `mode` deciding when it fires. Debounce applies to the field's whole validation pipeline:

```tsx
// After: react-f0rm
<Field
  name="email"
  mode="onChange"          // validate as the user types (form default: 'onSubmit')
  validateDebounce={300}   // debounce validation kicks for this field
  validate={async (value, {signal}) => {
    const res = await fetch(`/api/check-email?email=${encodeURIComponent(value)}`, {signal});
    const {taken} = await res.json();
    if (taken) return {type: 'taken', message: 'Email already registered'};
  }}
/>
```

Mapping table:

| TanStack | react-f0rm |
|---|---|
| `validators={{onChange}}` | `mode="onChange"` + `validate` |
| `validators={{onBlur}}` | `mode="onBlur"` + `validate` (or `'onTouched'`: first blur, then change) |
| `validators={{onSubmit}}` | default `mode: 'onSubmit'` + `validate` |
| sync + async pair (`onChange` + `onChangeAsync`) | one `validate`, sync or async — pending debounce windows count as validating, so submit waits them out |
| `asyncDebounceMs` / `onChangeAsyncDebounceMs` | `validateDebounce` (milliseconds per field) |
| validator receives `{value, fieldApi, signal}` | validator receives `(value, {form, path, signal})` |

Both libraries hand async validators an `AbortSignal` that fires when a newer round supersedes the old one — pass it to `fetch` (or timers) so stale network work cancels. react-f0rm additionally drops stale results independently of the signal, so validators that ignore it still stay correct.

Timing differences worth knowing:

- TanStack runs a validator on the event whose callback you declared; react-f0rm's `mode` is declarative — `'onSubmit'` (default), `'onBlur'`, `'onChange'`, `'onTouched'`, `'all'` — and any field can override the form's `mode` individually (`<Field mode="onBlur">`). Once a field has an error, re-validation follows the form-level `reValidateMode` (default `'onChange'`).
- Manual validation: `trigger(form, 'email')` returns `Promise<boolean>` and waits out async validators and debounce windows — the counterpart of TanStack's `form.validate()` / awaiting `handleSubmit`.

### 4. Schemas: `standardSchemaValidators` / adapters → `standardSchemaResolver` + `standardSchemaFormValidator`

TanStack Form v1 validates through Standard Schema implementations by passing the schema straight into `validators` (the early adapter packages — `@tanstack/zod-form-adapter`'s `zodValidator` / `valibotValidator` and friends — are deprecated; the built-in `standardSchemaValidators` replaced them):

```tsx
// Before: TanStack Form v1
import {z} from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const form = useForm({
  defaultValues: {email: '', password: ''},
  validators: {
    onChange: schema, // issues propagate to the matching fields automatically
  },
});
```

react-f0rm ships the same idea through one tree-shakeable entry point, at either level:

```tsx
// After: react-f0rm
import {createForm} from 'react-f0rm';
import {
  standardSchemaFormValidator,
  standardSchemaResolver,
} from 'react-f0rm/resolvers/standard-schema';
import {z} from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Form level: issue paths map onto field errors; pathless issues land on '_form'.
// The schema's parsed output becomes the getValues baseline for unedited fields.
const form = createForm({
  validate: standardSchemaFormValidator(schema),
});

// Field level: validate a single value
<Field name="email" validate={standardSchemaResolver(z.string().email())} />
```

Differences to expect:

- Error shape: TanStack exposes them per field as `StandardSchemaV1Issue[]` (via `field.state.meta.errors` and the form `errorMap`); react-f0rm stores `{type: 'standard', message}` entries in the field's `FieldError[]` — every issue is kept, and `error`/`useError` surface the first.
- **Parsed output.** TanStack does not preserve the schema's transformed output — you parse again inside `onSubmit` to get coerced values. react-f0rm's form-level adapter stores the schema's parsed output as a `parsedValues` baseline: `getValues()` reads it for any field without a live edit (`z.coerce.number()` hands back a real `number`), while a live edit always wins over the baseline — "the fields the user touched last" semantics. Dirty state keeps comparing live edits against `initialValues` only; parsing never marks a field dirty. Mind the corollary: a field the user just edited keeps reading its raw input — the live edit shadows the parsed baseline for as long as it exists, and submit re-reads through the same layering — so a coerce-on-submit flow must coerce inside the handler rather than waiting for validation to "catch up".
- Legacy resolvers: older zod (`zodResolver`) and yup (`yupResolver`) versions of zod v3.24- / yup ship from their own entry points (`react-f0rm/resolvers/zod`, `/yup`).

### 5. Fine-grained subscriptions: `form.subscribe(selector)` / `useSelector` → `useWatch` / `subscribe`

TanStack reads state through selectors — `useSelector` re-renders the calling component, `form.Subscribe` re-renders only itself:

```tsx
// Before: TanStack Form v1
import {useSelector} from '@tanstack/react-form';

// useSelector re-renders the calling component; form.Subscribe (a component,
// see section 6) re-renders only its own children.
const firstName = useSelector(form.store, s => s.values.firstName);

<form.Subscribe
  selector={s => s.values.province}
  children={province => <CityOptions country={province} />}
/>
```

react-f0rm's read side is a family of named hooks — each subscribes to the slice it reads and re-renders the calling component:

```tsx
// After: react-f0rm
import {useValue, useError, useDirtyFields} from 'react-f0rm';

const province = useValue(form, 'province');   // one field's value
const emailError = useError(form, 'email');    // first error message, or undefined
const dirty = useDirtyFields(form);            // {'user.name': true, …}
```

For slices the named hooks don't cover, `useWatch` subscribes to a form event and projects the current state through a getter:

```tsx
// After: react-f0rm
import {useWatch} from 'react-f0rm';

const province = useWatch(form.emitter, 'change', () => getValue(form, 'province'));
const hasAnyError = useWatch(form.emitter, 'errors', () => getErrors(form).length > 0);
```

**Imperative linkage.** TanStack's `listeners` API declares field-to-field effects (`onChange` listener on `province` calling `form.setFieldValue('city', '')`). react-f0rm's counterpart is `subscribe` — imperative, renders nothing, and works for unmounted watchers (autosave, analytics) too:

```tsx
// Before: TanStack Form v1 (listeners)
<form.Field
  name="province"
  listeners={{
    onChange: ({value}) => {
      if (value) form.setFieldValue('city', '');
    },
  }}
/>
```

```tsx
// After: react-f0rm (subscribe)
import {subscribe, getValue, setValue} from 'react-f0rm';

const unsubscribe = subscribe(form, {
  name: 'province',
  event: 'change',       // 'change' | 'errors' | 'touched' | 'submitting' | 'submitCount'
  scope: 'branch',       // wake on any tags.* descendant write; 'leaf' = exact key only
  callback: () => {
    if (getValue(form, 'city')) setValue(form, 'city', '');
  },
});
```

Semantics differ in shape, not capability: TanStack's selector diffs whatever state slice you return (values + meta + errorMap can be combined freely); react-f0rm organizes subscriptions by event type and path scope. `errors`/`touched` events match exact keys — another field's error never wakes your subscriber. A linked-field clear like the above is the canonical use of the `branch` scope.

### 6. `canSubmit` / `isSubmitting` → `useIsSubmitting` / `useSubmitCount` / `isDirty`

TanStack drives the submit button from the composite `canSubmit` flag (false once any field is invalid *and* the form has been touched):

```tsx
// Before: TanStack Form v1
<form.Subscribe
  selector={s => [s.canSubmit, s.isSubmitting]}
  children={([canSubmit, isSubmitting]) => (
    <button type="submit" disabled={!canSubmit}>
      {isSubmitting ? 'Saving…' : 'Save'}
    </button>
  )}
/>
```

react-f0rm has no built-in `canSubmit` composite — compose the submission hooks:

```tsx
// After: react-f0rm
import {useFormContext, useIsSubmitting, useHasErrors, useIsDirty} from 'react-f0rm';

function SaveButton() {
  const form = useFormContext();
  const isSubmitting = useIsSubmitting(form);
  const hasErrors = useHasErrors(form);
  const isDirty = useIsDirty(form); // any value differs from initialValues

  return (
    <button type="submit" disabled={isSubmitting || hasErrors || !isDirty}>
      {isSubmitting ? 'Saving…' : 'Save'}
    </button>
  );
}
```

Mapping: `state.isSubmitting` → `useIsSubmitting(form)`; `state.submissionAttempts` → `useSubmitCount(form)`; `state.canSubmit` → compose `useHasErrors` + `useIsDirty` to taste (TanStack's exact semantics — "invalid but untouched still submits" — is `disabled={hasErrors && isDirty}`); `state.isSubmitted` has no direct hook — read `form.submitCount > 0`. `<Form>`'s submit flow sets `isSubmitting` across the entire awaited handler and tracks `isSubmitSuccessful` on the instance.

### 7. Server-side errors → `setServerErrors`

TanStack routes server failures back through the validation machinery — either an `onSubmitAsync` validator returning the error map, or an imperative `setErrorMap`:

```tsx
// Before: TanStack Form v1
const form = useForm({
  defaultValues: {email: ''},
  validators: {
    onSubmitAsync: async ({value}) => {
      try {
        await api.register(value);
        return null;
      } catch (e) {
        return {
          form: 'Registration failed',
          fields: {email: e.data.errors.email.join(', ')},
        };
      }
    },
  },
});
```

react-f0rm has a dedicated single channel that takes the flat `Record<string, string | string[]>` shape REST APIs commonly return — a RealWorld `422 {errors: {email: ['has already been taken']}}` needs no reshaping:

```tsx
// After: react-f0rm
import {Form, Field, useForm, setServerErrors} from 'react-f0rm';

const form = useForm({initialValues: {email: ''}});

<Form
  form={form}
  onValidSubmit={async values => {
    try {
      await api.register(values);
    } catch (e) {
      // {email: ['has already been taken']} → stored as the field's error(s), type 'server'
      setServerErrors(form, e.data.errors);
    }
  }}
>
  <Field name="email" />
  <button type="submit">Register</button>
</Form>
```

String values land as one error, string arrays as several, an empty array clears the field, and existing errors are cleared first (pass `{keepExisting: true}` to layer instead). The messages then render through the same machinery as client errors — `renderError`, `useError`, and the `aria-invalid` / `aria-describedby` wiring all see them.

### 8. `useField` array paths → `useFieldArray` / `FieldPath`

TanStack treats arrays as a field with `mode="array"` and methods on the field API:

```tsx
// Before: TanStack Form v1
<form.Field name="tags" mode="array">
  {field => (
    <>
      {field.state.value.map((_, i) => (
        <form.Field key={i} name={`tags[${i}]`}>
          {subField => (
            <input
              value={subField.state.value}
              onChange={e => subField.handleChange(e.target.value)}
            />
          )}
        </form.Field>
      ))}
      <button type="button" onClick={() => field.pushValue('')}>Add</button>
    </>
  )}
</form.Field>
```

react-f0rm's `useFieldArray` returns stable row ids and the full set of movers:

```tsx
// After: react-f0rm
import {Field, useFieldArray} from 'react-f0rm';

function Tags() {
  const {fields, append, remove} = useFieldArray({name: 'tags'});
  return (
    <>
      {fields.map((field, index) => (
        <div key={field.id}>
          <Field name={['tags', index]} />
          <button type="button" onClick={() => remove(index)}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => append('')}>Add</button>
    </>
  );
}
```

Method mapping: `pushValue` → `append`, `removeValue` → `remove`, `insertValue` → `insert`, `swapValues` → `swap`, `moveValue` → `move`, `replaceValue(index, value)` → `update(index, value)` (single-row rewrite, same arity), `clearValues` → `replace([])`. Two more on the react-f0rm side: `prepend(value)`, and `replace(values)` — a full-list swap that regenerates every row id (the refetch shape; TanStack has no single-call equivalent). Row keys are stable across reorders (`field.id`), where the TanStack example above keys by index.

Nested paths: TanStack builds template strings (`people[${i}].name`); react-f0rm takes bracket-notation strings or segment arrays, both checked against `FieldPath<Values>`:

```tsx
// After: react-f0rm
interface Values {
  people: {name: string}[];
}

// 'people[0].name' | segments ['people', 0, 'name'] — typos fail at compile time
const name = useValue<Values, 'people[0].name'>(form, 'people[0].name');
```

When migrating from React Hook Form habits: dotted numeric paths (`'people.0.name'`) are rejected — they throw a `TypeError` naming the bracket spelling (`'people[0].name'`). Quoted brackets (`'items["0"]'`) explicitly address a string key.

## What Each Side Does NOT Cover

**react-f0rm has no equivalent of:**

- `form.Subscribe` as a component-local subscription (children re-render without re-rendering the owning component). Every react-f0rm hook re-renders its calling component; keep readers small or push them into leaf components.
- Arbitrary state-slice selectors with custom equality (`useSelector(form.store, s => …, {compare})`). The named hooks plus `useWatch(emitter, event, getter)` cover the slices; combining several reads means several hooks.
- `createFormHook` / `useAppForm` pre-bound component registries, `extendForm`, and the `withForm` HOC for splitting large forms. The react-f0rm shape is `createFormContext<Values>()` for typed shared contexts plus passing `form` explicitly.
- `listeners` with `onChangeListenTo` (a field reacting to *other* fields' changes). Use `subscribe` for the linkage imperatively, or validate cross-field rules at the form level (`createForm({validate})`).
- `onSubmitMeta` (extra data passed through `handleSubmit`). Close it over the values in your own callback.
- Field-level `isPristine` / `isDefaultValue` / `isBlurred` meta. react-f0rm exposes touched/dirty at the form level (`useTouchedFields`, `useDirtyFields`, `hasTouched(form, name)`).
- Persistent dirty semantics: react-f0rm's dirty comparison is against `initialValues` — a reverted edit is clean again (TanStack keeps such fields dirty unless `isDefaultValue` is used).

**TanStack Form v1 has no equivalent of:**

- `setServerErrors(form, errors)` — the one-call, flat-record channel for REST 422 responses (`type: 'server'`, keep/replace semantics). TanStack routes server errors through validators or `setErrorMap`.
- The `parsedValues` baseline: TanStack explicitly does not preserve a Standard Schema's transformed output; react-f0rm's form-level adapter stores it, so `getValues()` and submit callbacks read coerced/transformed values directly.
- Declarative `rules` (`required` / `min` / `max` / `minLength` / `maxLength` / `pattern` with per-rule messages) compiled into the validation pipeline.
- Native constraint validation integration: `checkValidity()` gates submission, failures surface as `type: 'native'` errors and `reportValidity()` bubbles.
- Failure UX knobs: `shouldFocusError` auto-focus of the first errored field, `setFocus(form, name)` imperative focus, `delayError` render-layer error delay.
- Lifecycle precision: `reset(form, values, {keepDirtyValues, keepTouched, …})`, `resetField(form, name, {value, keepErrors})`, `setInitialValues` with content comparison, `trigger(form, name?)` returning `Promise<boolean>`, per-field `mode` overrides with form-level `reValidateMode`.
- Tombstone unregister: an unmounted field's value drops out of `getValues()` instead of silently reviving from initial values (`shouldUnregister: false` to keep it). TanStack keeps values in the store regardless of unmounting.

## Further Reading

- [TanStack Form docs](https://tanstack.com/form) — validation, subscription and composition guides referenced throughout.
- [Comparison](../comparison.md) — react-f0rm vs React Hook Form, TanStack Form and Formik at a glance.
- [Migrating from React Hook Form](./from-react-hook-form.md) and [Migrating from Formik](./from-formik.md) — the other migration guides.
