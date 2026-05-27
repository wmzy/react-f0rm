---
sidebar_position: 1
---

# Form Component

The root component that provides form context.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `initialValues` | `T` | Initial form values |
| `form` | `Form<T>` | External form instance (from `useForm`) |
| `onSubmit` | `(values: T, e: FormEvent) => void` | Called on submit (before validation) |
| `onValidSubmit` | `(values: T, e: FormEvent) => void` | Called after validation passes |
| `onInvalidSubmit` | `(errors: string[], values: T) => void` | Called when validation fails |

Also accepts all native `<form>` HTML attributes.

## Example

```tsx
<Form
  initialValues={{ name: '' }}
  onValidSubmit={(values) => saveUser(values)}
  onInvalidSubmit={(errors) => showError(errors)}
>
  <Field name="name" required />
  <button type="submit">Save</button>
</Form>
```
