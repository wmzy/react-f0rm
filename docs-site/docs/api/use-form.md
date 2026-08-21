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
| `validate` | `(values: T) => Record<string, any> \| Promise<Record<string, any>>` | Form-level validator; nested results are flattened onto field paths (see [Validation](../guides/validation.md)) |
| `mode` | `'onSubmit' \| 'onBlur' \| 'onChange' \| 'onTouched' \| 'all'` | When fields are validated (default: `'onSubmit'`) — see [Validation Timing](../guides/validation.md#validation-timing) |
| `reValidateMode` | `'onChange' \| 'onBlur' \| 'onSubmit'` | When a field is re-validated **after it already has an error** (default: `'onChange'`) |

## Form Instance API

The returned instance (also created by `createForm`) is passed to the plain functions exported from `react-f0rm`:

### Values

| Function | Returns | Description |
|----------|---------|-------------|
| `getValues(form)` | `T` | All values — the written values layered over `initialValues`; unregistered (tombstoned) paths are omitted |
| `getValue(form, name)` | value | Field value at `name` |
| `setValue(form, name, value)` | | Write a field value |
| `setInitialValues(form, values)` | | Replace initialValues and clear written values |

### Errors

Errors are stored as `FieldError` objects — `{type: string, message: string}` — where `type` identifies the kind (`'custom'` for plain string errors) and `message` is the display text.

| Function | Returns | Description |
|----------|---------|-------------|
| `getError(form, name)` | `FieldError \| undefined` | Error object at `name` |
| `getErrors(form)` | `{path, type, message}[]` | All errors flattened, in insertion order |
| `getFirstError(form)` | `string \| undefined` | First error's **message** string |
| `hasErrors(form)` | `boolean` | Any error present |
| `setError(form, name, error)` | | Set error — accepts `string` (normalized to `{type: 'custom', message}`), a `FieldError`, or `undefined` to clear |
| `clearErrors(form)` | | Clear all errors |

### Dirty / touched state

| Function | Returns | Description |
|----------|---------|-------------|
| `isDirty(form)` | `boolean` | Any value differs from `initialValues` |
| `getDirtyFields(form)` | `Record<string, boolean>` | Each dirty field's user-facing dotted path (`'a.b'`, `'a.0.c'`) mapped to `true` |
| `setTouched(form, name)` | | Mark a field touched |
| `hasTouched(form, name)` | `boolean` | Has the field been touched |
| `isTouched(form)` | `boolean` | Any field touched |
| `getTouchedFields(form)` | `string[]` | Touched fields' dotted paths (`'a.b'`, `'a.0'`) |

### Lifecycle

| Function | Description |
|----------|-------------|
| `trigger(form)` | Run every registered field validator |
| `validate(form)` | Validate everything; resolves to the first error **message** string or `void` |
| `ensureValidate(form)` | Like `validate`, but rejects (throws) when any error exists |
| `removeField(form, name)` | Unregister a field — the path is tombstoned, so `getValues()` omits it and does not fall back to `initialValues` |
| `reset(form, initialValues?)` | Full reset — see below |

`reset` clears values, errors, touched state, validating state **and** the submission flags: `isSubmitting` → `false`, `submitCount` → `0`, `isSubmitSuccessful` → `undefined`. Pass `initialValues` to start from a fresh baseline; the omitted-fields tombstones are cleared too.

## Related Hooks

- `useValue(form, name)` — reactive field value
- `useError(form, name)` — reactive error **message** string
- `useTouched(form, name)` — reactive touched state
- `useIsDirty(form)` — reactive dirty state
- `useDirtyFields(form)` — reactive `Record<string, boolean>` of dirty fields (dotted paths), recalculated after changes
- `useTouchedFields(form)` — reactive `string[]` of touched fields (dotted paths), recalculated after blur/touch events
- `useHasErrors(form)` — reactive error state
- `useIsSubmitting(form)` — reactive submitting state
- `useSubmitCount(form)` — reactive submit count
