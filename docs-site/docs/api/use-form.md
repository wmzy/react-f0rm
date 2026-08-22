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
| `values` | `T` | Controlled external values — re-synced into the form when they **genuinely change** (reference-first with a structural fallback: an inline literal with equal content never re-syncs, so re-renders don't clobber in-progress edits) |
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

Errors are stored as `FieldError` objects — `{type: string, message: string}` — where `type` identifies the kind (`'custom'` for plain string errors) and `message` is the display text. Every field holds an **ordered array** of them; `getError` reads the first entry, `getFieldErrors` reads them all (see [Multiple Errors](../guides/validation.md#multiple-errors-per-field)).

| Function | Returns | Description |
|----------|---------|-------------|
| `getError(form, name)` | `FieldError \| undefined` | First error object at `name` |
| `getFieldErrors(form, name)` | `FieldError[]` | Every error at `name`, insertion order; empty array when none |
| `getErrors(form)` | `{path, type, message}[]` | All errors flattened, in insertion order — one entry per error |
| `getFirstError(form)` | `string \| undefined` | First error's **message** string |
| `hasErrors(form)` | `boolean` | Any error present |
| `setError(form, name, error)` | | Set errors — accepts a `string` (normalized to `{type: 'custom', message}`), a `FieldError`, an array mixing both (several errors on one field), or `undefined` to clear |
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
| `trigger(form, name?)` | Run registered field validators — every one, or just `name` (a single name or an array). Returns `Promise<boolean>` that waits for validation to settle (async validators and pending debounce windows included) and resolves `true` when the triggered scope is error-free; it never rejects |
| `validate(form)` | Validate everything; resolves to the first error **message** string or `void` |
| `ensureValidate(form)` | Like `validate`, but rejects (throws) when any error exists |
| `removeField(form, name)` | Unregister a field — the path is tombstoned, so `getValues()` omits it and does not fall back to `initialValues` |
| `setFocus(form, name, options?)` | Focus a bound field's element programmatically — see below |
| `reset(form, initialValues?, options?)` | Full reset — see below |

`reset` clears values, errors, touched state, validating state **and** the submission flags: `isSubmitting` → `false`, `submitCount` → `0`, `isSubmitSuccessful` → `undefined`. Pass `initialValues` to start from a fresh baseline; the omitted-fields tombstones are cleared too.

#### Reset options

The third argument opts into keeping slices of state through the reset. Every flag defaults to `false` — omitting the object keeps the plain full-reset behavior (names mirror react-hook-form's reset options to ease migration):

| Option | Type | Description |
|--------|------|-------------|
| `keepDirtyValues` | `boolean` | Keep the current values of fields that are dirty — differ from the pre-reset `initialValues` (same rule as `getDirtyFields`); clean fields fall back to the new baseline |
| `keepTouched` | `boolean` | Keep the touched set instead of clearing it |
| `keepErrors` | `boolean` | Keep field errors instead of clearing them |
| `keepIsSubmitted` | `boolean` | Keep `isSubmitSuccessful` instead of clearing it |
| `keepSubmitCount` | `boolean` | Keep `submitCount` instead of resetting it to 0 |
| `keepIsSubmitting` | `boolean` | Keep `isSubmitting` instead of resetting it to `false` |

The refetch-preserves-dirty-drafts shape:

```tsx
// data changed (refetch, different user) — replace the draft,
// but never clobber fields the user is mid-edit on
useEffect(() => {
  if (data) reset(form, data, {keepDirtyValues: true});
}, [data]);
```

#### `setFocus`

```tsx
setFocus(form, 'email');                            // focus the bound field's element
setFocus(form, 'user.name', {shouldSelect: true});  // focus and select its text
```

Rides the same `'focusError'` event channel a failed `handleSubmit` uses to focus the first errored field, so it is a silent no-op when the field is unmounted or nothing subscribes — unknown names never throw. `shouldSelect` (default `false`) calls `select()` on the element after focusing; elements without one (custom `as` components) just focus.

## Related Hooks

- `useValue(form, name)` — reactive field value
- `useError(form, name)` — reactive error **message** string
- `useFieldErrors(form, name)` — reactive `FieldError[]` of every error on the field (insertion order; reference-stable when clean)
- `useTouched(form, name)` — reactive touched state
- `useIsDirty(form)` — reactive dirty state
- `useDirtyFields(form)` — reactive `Record<string, boolean>` of dirty fields (dotted paths), recalculated after changes
- `useTouchedFields(form)` — reactive `string[]` of touched fields (dotted paths), recalculated after blur/touch events
- `useHasErrors(form)` — reactive error state
- `useIsSubmitting(form)` — reactive submitting state
- `useSubmitCount(form)` — reactive submit count
