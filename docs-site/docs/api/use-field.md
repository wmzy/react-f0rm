---
sidebar_position: 4
---

# useField Hook

Low-level hook for custom field components.

## Usage

```tsx
function CustomInput({ name }) {
  const { value, error, errorObject, onChange, onBlur } = useField({ name });
  return (
    <div>
      <input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      {error && <span role='alert'>{error}</span>}
    </div>
  );
}
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string \| (string\|number)[]` | Field name |
| `form` | `Form` | Explicit form instance — wins over the context and makes the hook work outside a `<Form>` provider |
| `initialValue` | `any` | Override initial value |
| `validate` | `(value, meta) => string \| FieldError \| (string\|FieldError)[] \| undefined \| Promise<…>` | Validator (strings are normalized to `{type: 'custom', message}`); `meta` is `{form, path, signal}` — `meta.signal` aborts as soon as the round is superseded |
| `validateDebounce` | `number` | Milliseconds to debounce this field's validation kicks (default `0` — validate immediately); while the timer is pending the field counts as validating, so `trigger`/submit wait out the window. Only the last kick inside the window runs |
| `shouldUnregister` | `boolean` | Remove the field on unmount (default: `true`) |

## Returns

| Property | Type | Description |
|----------|------|-------------|
| `form` | `Form` | The form instance this field is bound to (explicit prop or context) |
| `value` | `any` | Current field value |
| `error` | `string \| undefined` | Current error's message string (for display) |
| `errorObject` | `FieldError \| undefined` | Full error object (`{type, message}`) |
| `errors` | `FieldError[]` | Every error registered for the field, insertion order — `error`/`errorObject` are its first entry; empty and reference-stable when clean |
| `onChange` | `(value: any) => void` | Update value |
| `onBlur` | `() => void` | Mark as touched |
| `name` | `string` | Serialized field name (path key) |

## Unregister Semantics

On unmount the field is removed and leaves a **tombstone**: `getValues()` omits the field instead of falling back to `initialValues`. Writing the path again (e.g. a remounted field or a rewritten parent array) revives the branch and clears the tombstone. Pass `shouldUnregister: false` to keep the value after unmount.
