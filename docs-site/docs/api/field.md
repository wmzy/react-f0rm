---
sidebar_position: 2
---

# Field Component

A controlled input component with built-in validation support.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `name` | `string \| (string\|number)[]` | Field name (supports dot notation) |
| `as` | `ComponentType` | Custom component to render |
| `validate` | `(value, meta) => string \| undefined` | Field-level validator |
| `initialValue` | `any` | Override initial value |
| `eventToValue` | `(event) => any` | Transform event to value |
| `valueToProps` | `(value) => object` | Transform value to props |

Also accepts all native `<input>` HTML attributes.

## Examples

### Basic
```tsx
<Field name="email" type="email" required />
```

### Custom Component
```tsx
<Field name="bio" as={textarea} rows={4} />
```

### With Validation
```tsx
<Field
  name="email"
  validate={(value) => {
    if (!value.includes('@')) return 'Invalid email';
  }}
/>
```
