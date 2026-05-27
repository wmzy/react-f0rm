---
sidebar_position: 3
---

# useForm Hook

Creates a form instance for use outside the `<Form>` component.

## Usage

```tsx
const form = useForm({
  initialValues: { name: '' },
});
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `initialValues` | `T` | Initial form values |
| `validate` | `(values: T) => Record<string, string>` | Form-level validator |
| `validateOnChange` | `boolean` | Validate on every change |
| `validateOnBlur` | `boolean` | Validate on blur |
| `revalidateOnChange` | `boolean` | Re-validate when value changes (default: true) |

## Related Hooks

- `useValue(form, name)` — reactive field value
- `useError(form, name)` — reactive field error
- `useTouched(form, name)` — reactive touched state
- `useIsDirty(form)` — reactive dirty state
- `useHasErrors(form)` — reactive error state
- `useIsSubmitting(form)` — reactive submitting state
- `useSubmitCount(form)` — reactive submit count
