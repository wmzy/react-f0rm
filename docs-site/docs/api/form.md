---
sidebar_position: 1
---

# Form Component

The root component that provides form context.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `initialValues` | `T` | Initial form values |
| `form` | `Form<T>` | External form instance (from `useForm`) — the component then only provides context and submit handling |
| `onSubmit` | `(values: T, e: FormEvent) => void` | Called after validation passes, before `onValidSubmit` |
| `onValidSubmit` | `(values: T, e: FormEvent) => void` | Called after `onSubmit` when validation passes |
| `onInvalidSubmit` | `(errors: {path: string; type: string; message: string}[], values: T) => void` | Called when validation fails; `errors` is an array in insertion order — `path` is the dotted field path (`'a.b'`, `'list.0'`), `type` the error kind (`'custom'` for plain string errors), `message` the display text |

Also accepts all native `<form>` HTML attributes.

## Native Validation Gate

The rendered `<form>` always sets `noValidate` — the browser's built-in blocked-submit UI is suppressed. Native constraint validation still gates submission:

1. On submit, the form element's `checkValidity()` runs **before** custom validators.
2. If a native constraint fails (`required`, `type=email`, `minLength`, …), `reportValidity()` surfaces the offending constraint as a native bubble, `onInvalidSubmit` fires with the current errors, and submission stops.
3. `onSubmit` / `onValidSubmit` only run once every native constraint passes *and* custom validation succeeds.

## Example

```tsx
<Form
  initialValues={{ name: '' }}
  onValidSubmit={(values) => saveUser(values)}
  onInvalidSubmit={(errors) => {
    // errors: [{path: 'name', type: 'custom', message: 'Required'}]
    showError(errors);
  }}
>
  <Field name='name' required />
  <button type='submit'>Save</button>
</Form>
```
