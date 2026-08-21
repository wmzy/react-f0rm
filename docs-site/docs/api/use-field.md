---
sidebar_position: 4
---

# useField Hook

Low-level hook for custom field components.

## Usage

```tsx
function CustomInput({ name }) {
  const { value, error, onChange, onBlur } = useField({ name });
  return (
    <div>
      <input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      {error && <span>{error}</span>}
    </div>
  );
}
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string \| (string\|number)[]` | Field name |
| `form` | `Form` | Form instance (optional, uses context if omitted) |
| `initialValue` | `any` | Override initial value |
| `validate` | `(value, meta) => string \| FieldError \| undefined` | Validator (strings are normalized to `{type: 'custom', message}`) |
| `shouldUnregister` | `boolean` | Remove value on unmount (default: false) |

## Returns

| Property | Type | Description |
|----------|------|-------------|
| `value` | `any` | Current field value |
| `error` | `string \| undefined` | Current error's message string |
| `errorObject` | `FieldError \| undefined` | Full error object (`{type, message}`) |
| `onChange` | `(value: any) => void` | Update value |
| `onBlur` | `() => void` | Mark as touched |
| `name` | `string` | Serialized field name |
