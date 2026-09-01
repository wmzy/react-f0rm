# Validation

## Field-level Validation

Pass a `validate` function to `<Field>`. It may return a plain message string (normalized to `{type: 'custom', message}`) or a full `FieldError`:

```tsx
<Field
  name='email'
  validate={(value) => {
    if (!value) return 'Required';
    if (!value.includes('@')) return {type: 'format', message: 'Invalid email'};
  }}
/>
```

The validator receives `(value, meta)` where `meta` is `{form, path, signal}`. Async validators (returning a Promise) are supported; `meta.signal` aborts as soon as the round is superseded (see [Async Validation](#async-validation)).

## Rules

For declarative constraints, pass `rules` to `Field` (or any bound component — `Checkbox`, `Select` — or `useField`) instead of hand-writing a `validate` function. Rule failures land in the form's error state as `FieldError`s (`type` is the rule name) carrying your message, so any design system can render them uniformly instead of the browser's validity bubble:

```tsx
<Field
  name='age'
  rules={{
    required: 'Age is required',
    min: 18,
    messages: {min: 'Must be an adult'}
  }}
/>
```

| Rule | Value | Fails when | Default message |
|------|-------|------------|-----------------|
| `required` | `string \| true` | value is `''`, `undefined` or `null` (`0` and `false` count as filled) | `'This field is required'` |
| `min` | `number` | `Number(value) < min` — values converting to `NaN` skip the rule | `` `Must be at least ${min}` `` |
| `max` | `number` | `Number(value) > max` — `NaN` skips | `` `Must be at most ${max}` `` |
| `minLength` | `number` | a string value is shorter — non-strings skip | `` `Must be at least ${n} characters` `` |
| `maxLength` | `number` | a string value is longer — non-strings skip | `` `Must be at most ${n} characters` `` |
| `pattern` | `{value: RegExp, message: string}` | `pattern.value.test(value)` is false | the given `message` |

The optional top-level `messages` record overrides messages per rule type (`min`, `max`, `minLength`, `maxLength`, `pattern`) — useful for centralizing or localizing them.

Semantics:

- A failing `required` short-circuits the rest — an empty value reports only its `required` error, not a full panel.
- Every other failing rule collects into one ordered `FieldError[]` (see [Multiple Errors per Field](#multiple-errors-per-field)).
- `rules` composes with `validate`: rules run first, then `validate` (awaited when async), merging both sources' errors with rules ahead.
- Rules ride the exact same pipeline as `validate` — `mode`, `reValidateMode`, `validateDebounce` and `meta.signal` all apply unchanged.

Rules vs native constraints: HTML attributes (`required`, `type='email'`, `min`, …) keep running through the browser's `checkValidity`, whose bubble remains the pre-submit fallback. `rules` is the state-side alternative — failures are queryable (`getErrors`, `error`, `errors`), renderable by any UI, and carry your own messages. Prefer `rules` whenever the error text must be controlled.

## Form-level Validation

Pass a `validate` function to `<Form>` (or `useForm`). The result may be **nested** — nested objects are flattened onto field paths, so `{user: {name: 'Required'}}` sets the error on `'user.name'`. Array values contribute their first non-empty string (zod `flatten()` formErrors style). Falsy leaves are skipped:

```tsx
<Form
  initialValues={{ password: '', confirm: '' }}
  validate={(values) => {
    if (values.password !== values.confirm) {
      return { confirm: 'Passwords must match' };
    }
    return {};
  }}
>
```

### Re-running on dependent field changes (`validateDeps`)

By default the form-level `validate` runs on `trigger` and submit only — a cross-field error stays on screen even after the user edits the field that would fix it. `validateDeps` declares the fields whose **user changes re-run the form-level `validate`**:

```tsx
const form = useForm({
  initialValues: {password: '', confirm: ''},
  validate: values =>
    values.password !== values.confirm
      ? {confirm: 'Passwords do not match'}
      : {},
  validateDeps: ['password']
});
```

The submit-then-fix flow now works: submit lands the mismatch on `confirm`, editing `password` re-runs the validate, and the passing round makes the error disappear.

The re-run timing rides the same mode matrix as any field validator, evaluated against the changed field's effective `mode` (per-field override included) and the form's `reValidateMode`:

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

## Schema Validation

Use the Zod or Yup resolvers at field level:

```tsx
import { zodResolver } from 'react-f0rm/resolvers/zod';
import { z } from 'zod';

const emailSchema = z.string().email('Invalid email');

<Field name='email' validate={zodResolver(emailSchema)} />
```

### Standard Schema

One adapter covers every library implementing the [Standard Schema](https://standardschema.dev) spec — zod v3.24+/v4, valibot v1, arktype, and more. Import from `react-f0rm/resolvers/standard-schema`:

```tsx
import {Form, useForm} from 'react-f0rm';
import {
  standardSchemaResolver,
  standardSchemaFormValidator
} from 'react-f0rm/resolvers/standard-schema';
import { z } from 'zod';

// Field-level: validate one value with any ~standard schema
<Field name='email' validate={standardSchemaResolver(z.string().email('Invalid email'))} />

// Form-level: validate the whole values object with one object schema
const schema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
});

function Example() {
  const form = useForm({
    initialValues: { name: '', email: '' },
    validate: standardSchemaFormValidator(schema),
  });
  return <Form form={form}>{/* ... */}</Form>;
}
```

`standardSchemaFormValidator` maps issue paths onto field names automatically (nested paths become nested errors that the form-level flattening resolves per field); issues without a path are form-level errors on the `_form` key. Errors carry `type: 'standard'`.

See [Schema Resolvers](../api/resolvers.md) for details.

## Parsed Values

When a form-level schema validation succeeds, `standardSchemaFormValidator` returns the schema's parsed output, and the form stores it as its **parsed baseline** — the layer `getValues()` reads above `initialValues`:

```tsx
import {useForm, getValues, trigger} from 'react-f0rm';
import {standardSchemaFormValidator} from 'react-f0rm/resolvers/standard-schema';
import {z} from 'zod';

const schema = z.object({age: z.coerce.number().min(18)});

const form = useForm({
  initialValues: {age: ''},
  validate: standardSchemaFormValidator(schema)
});

await trigger(form);
getValues(form); // {age: 42} — a real number, not the raw string
```

- **When it is written back:** each successful form-level validation replaces the baseline with the schema's complete output tree — `getValues()` and the submit callbacks (`onSubmit` / `onValidSubmit`) read coerced/transformed values from then on (`z.coerce.number()` hands back a real `number`; fields the schema dropped disappear from reads).
- **Live edits win:** the baseline sits between `initialValues` and live edits — a field the user changes afterwards still reads its edited value.
- **Parsing is not an edit:** dirty state keeps comparing live edits against `initialValues` only, so a successful parse never marks a field dirty.
- **Reset clears it:** `reset()` and `setInitialValues()` drop the whole baseline; `resetField(form, name)` removes the field's path from it so the initial value is pinned back.

## Async Validation

Async validators are first-class. Two knobs keep them cheap and race-free:

### `validateDebounce`

Pass `validateDebounce` (milliseconds) to `Field`, `useField` or any bound component. Validation kicks are delayed by that window; only the last kick inside it runs the validator. While the timer is pending the field counts as **validating**, so `trigger` and submit wait the window out instead of racing it.

### `meta.signal`

Every validator's second argument carries `{form, path, signal}`. The `AbortSignal` fires as soon as the round is superseded — a newer round started, or the field unregistered — so async validators can cancel their underlying work instead of racing a stale result home:

```tsx
<Field
  name='email'
  validateDebounce={300}
  validate={async (value, {signal}) => {
    const res = await fetch(`/api/check-email?email=${encodeURIComponent(value)}`, {signal});
    const {taken} = await res.json();
    if (taken) return {type: 'taken', message: 'Email already registered'};
  }}
/>
```

Stale results are dropped independently of the signal — validators that ignore it stay correct — but passing it to `fetch` (or `AbortSignal.timeout`, timers, …) also cancels the network work itself.

## Manual Trigger

`trigger(form, name?)` runs field validators on demand — every registered one, or just the fields named by `name` (a single name or an array):

```tsx
import {trigger} from 'react-f0rm';

trigger(form);                               // every registered field validator
trigger(form, 'email');                      // one field
trigger(form, ['user.name', 'user.email']);  // several
```

It returns `Promise<boolean>` that waits for the triggered validation to settle — async validators and pending debounce windows included — and resolves `true` when the triggered scope is error-free, `false` otherwise. It never rejects: landing errors is the expected outcome, not a failure.

```tsx
if (await trigger(form, 'email')) {
  proceed(); // 'email' is now guaranteed error-free
}
```

Without `name` the scope is all fields plus the form-level `validate` result; with `name` only those fields' own errors count and form-level `validate` is skipped (RHF semantics). Fire-and-forget callers may ignore the promise — the validator kicks still happen synchronously.

## Multiple Errors per Field

Every field stores an ordered `FieldError[]`, not a single error. The first entry is what `error`/`errorObject`/`getError` expose; readers wanting all of them use `getFieldErrors(form, name)` or `useFieldErrors(form, name)`:

```tsx
import {getFieldErrors, useFieldErrors, setError} from 'react-f0rm';

const all = getFieldErrors(form, 'password');
// [{type: 'min', message: 'Too short'}, {type: 'pattern', message: 'Needs a digit'}]

setError(form, 'password', [
  {type: 'min', message: 'Too short'},
  {type: 'pattern', message: 'Needs a digit'}
]);
```

`setError` accepts a string, a `FieldError`, an array mixing both, or `undefined` to clear. Schema resolvers pass every issue through — a value breaking several rules collects all of them (Standard Schema/zod by design, yup via `abortEarly: false`) — and `getErrors()` contributes one entry per error.

## Validation Timing

`mode` controls when fields are validated (default: `'onSubmit'`):

- `'onSubmit'` — only on submit
- `'onBlur'` — when the field loses focus
- `'onChange'` — on every change
- `'onTouched'` — on first blur, then on every change
- `'all'` — on both change and blur

```tsx
useForm({ mode: 'onBlur' });
```

`reValidateMode` supplements `mode` in any mode, but only takes effect once a field already has an error (default: `'onChange'`): `'onChange'` re-validates on every change, `'onBlur'` when the field loses focus, `'onSubmit'` only on submit (no live re-validation).

```tsx
useForm({ mode: 'onSubmit', reValidateMode: 'onChange' });
// validate on submit; after the first error, re-validate live on every keystroke
```

## Delaying Error Display

`delayError` (milliseconds) holds a **newly appearing** error back from the render for a short window — users typing through a field are not interrupted by an error the next keystroke may already fix:

```tsx
<Field name='username' rules={{minLength: 3}} delayError={300} />
```

Pass it to `Field`, `useField` or any bound component (`Checkbox`, `Select`), like `validateDebounce`.

The delay is render-layer only: `error`/`errorObject`/`errors` from `useField` (and everything `Field` derives from them — `aria-invalid`, `renderError`) stay `undefined`/empty until the window passes. The form's error state is never delayed — `trigger`, submit and `getError(form, name)` read the error immediately, unlike react-hook-form's formState-level delay. An error that clears inside the window never shows at all; once an error is visible, later changes (a new message, entries added or removed) apply immediately — only the none → some transition waits.

## Reading Errors

Errors are stored as `FieldError` objects (`{type, message}`) — every field holds an ordered array of them:

- `getError(form, 'email')` → `FieldError | undefined` (the first entry)
- `getFieldErrors(form, 'email')` → `FieldError[]` — every error on the field, insertion order
- `useField(...).error` → the message **string**; `.errorObject` → the full `FieldError`; `.errors` → all of them
- `getErrors(form)` → flattened `{path, type, message}[]` (insertion order, one entry per error)
- `getFirstError(form)` → the first error's message string
- `useFieldErrors(form, 'email')` → reactive `FieldError[]`, reference-stable while clean

See [Multiple Errors per Field](#multiple-errors-per-field).

## Server-side Errors

Client-side validation cannot know what the server rejects — an email already registered, a username taken. `setServerErrors(form, errors)` lands such a response on the same error channel, field by field, with `type: 'server'`:

```tsx
import {setServerErrors} from 'react-f0rm';

async function onSubmit(values) {
  try {
    await api.post('/users', {user: values});
  } catch (e) {
    // e.data.errors: {email: ['has already been taken']} (RealWorld 422)
    setServerErrors(form, e.data.errors);
  }
}
```

- Takes the flat `Record<string, string | string[]>` APIs commonly return — no hand-rolled `Object.entries` + `setError` loop. A string lands as one error, a string array as several (first is what `getError`/`error` expose); an empty array clears that field.
- Existing errors are cleared first — a fresh response describes the current state, not a patch onto stale client errors. Pass `{keepExisting: true}` to layer instead.
- The message renders through the normal machinery (`renderError`, `useError`, `aria-invalid`/`aria-describedby` — see [Field API](../api/field.md#error-rendering--accessibility)), so client and server errors are indistinguishable downstream except by `type`.

The requirement on the API layer is just to keep the structured errors around instead of joining them into one sentence — map the non-2xx body (`{errors: {...}}`) to an error object carrying it (`e.data.errors` above).
