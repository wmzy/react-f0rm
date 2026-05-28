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

## Prop Forwarding

All props **not** consumed by `Field` are forwarded to the underlying component via `...rest`. This means you can pass any props your custom component needs:

```tsx
<Field
  name="bio"
  as={MyTextArea}
  rows={4}            // forwarded to MyTextArea
  maxLength={500}     // forwarded to MyTextArea
  placeholder="..."   // forwarded to MyTextArea
/>
```

The following props are **consumed** by `Field` and will **not** be forwarded: `name`, `as`, `validate`, `initialValue`, `eventToValue`, `valueToProps`.

The component rendered via `as` receives:
- `value` — the current field value
- `onChange` — call to update the value
- All forwarded props

## Examples

### Basic
```tsx
<Field name="email" type="email" required />
```

### Custom Component
```tsx
<Field name="bio" as="textarea" rows={4} />
```

### Custom Component with Props
```tsx
function StarRating({ value, onChange, maxStars = 5, ...props }) {
  return (
    <div {...props}>
      {Array.from({ length: maxStars }, (_, i) => (
        <span key={i} onClick={() => onChange(i + 1)}>
          {i < value ? '★' : '☆'}
        </span>
      ))}
    </div>
  );
}

// maxStars and className are forwarded to StarRating
<Field name="rating" as={StarRating} maxStars={10} className="stars" />
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

### Event-to-Value Transform
```tsx
<Field
  name="color"
  as="select"
  eventToValue={(e) => e.target.value}
>
  <option value="red">Red</option>
  <option value="blue">Blue</option>
</Field>
```
