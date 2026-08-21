---
sidebar_position: 2
---

# Field Component

A controlled input component with built-in validation support and error accessibility.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `name` | `string \| (string\|number)[]` | Field name (supports dot notation, quoted subscripts like `a['b c']`) |
| `as` | `ComponentType` | Custom component to render |
| `asProps` | `Record<string, any>` | Props passed directly to the `as` component (use when prop names conflict with Field's own props) |
| `validate` | `(value, meta) => string \| FieldError \| undefined` | Field-level validator; strings are normalized to `{type: 'custom', message}` |
| `initialValue` | `any` | Override initial value |
| `eventToValue` | `(event) => any` | Transform event to value |
| `valueToProps` | `(value) => object` | Transform value to props |
| `renderError` | `(error: string, id: string) => ReactNode` | Optional error renderer (see [Error Rendering & Accessibility](#error-rendering--accessibility)) |
| `form` | `Form` | Explicit form instance — skips the form context, works without a `<Form>` provider |
| `shouldUnregister` | `boolean` | Remove the field's value on unmount (default: `true`) |
| `...props` | `any` | All other props are forwarded to the rendered component |

When `as` is omitted, `...props` are passed to a native `<input>`. When `as` is a custom component, `...props` are spread onto that component along with `value` and `onChange`. If a prop name conflicts (e.g., your component has a `validate` prop), use `asProps` to pass it explicitly.

## Prop Forwarding

All props **not** consumed by `Field` are forwarded to the underlying component via `...rest`. This means you can pass any props your custom component needs:

```tsx
<Field
  name='bio'
  as={MyTextArea}
  rows={4}            // forwarded to MyTextArea
  maxLength={500}     // forwarded to MyTextArea
  placeholder='...'   // forwarded to MyTextArea
/>
```

The following props are **consumed** by `Field` and will **not** be forwarded: `name`, `as`, `asProps`, `validate`, `initialValue`, `eventToValue`, `valueToProps`, `renderError`, `form`, `shouldUnregister`.

The component rendered via `as` receives:
- `value` — the current field value
- `onChange` — call to update the value
- All forwarded props

## Error Rendering & Accessibility

When a field has an error, `Field` sets `aria-invalid` on the rendered input automatically.

Pass `renderError` to render the message yourself. When the field has an error, `Field` renders:

```tsx
<span id={id} role='alert'>{renderError(error, id)}</span>
```

next to the input, and points the input's `aria-describedby` at that `id` (derived from the field path, e.g. `'todos.0'` → `'todos-0'`). `renderError` receives the error **message string** and the generated `id`.

```tsx
<Field
  name='email'
  placeholder='Email'
  renderError={(error) => <em className='field-error'>{error}</em>}
/>
```

When `renderError` is omitted, no extra element is rendered (headless) and no `aria-describedby` is attached — screen readers are not pointed at an id that does not exist.

`Field` also stays in sync with the browser's constraint validation API: the current error message is pushed to the input via `setCustomValidity`, and native constraints (`required`, `type=email`, `minLength`, …) are checked before your `validate` function — a failing native constraint surfaces as a native bubble and skips custom validation for that pass.

## Examples

### Basic
```tsx
<Field name='email' type='email' required />
```

### Custom Component
```tsx
<Field name='bio' as='textarea' rows={4} />
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
<Field name='rating' as={StarRating} maxStars={10} className='stars' />
```

### With Validation
```tsx
<Field
  name='email'
  validate={(value) => {
    if (!value.includes('@')) return 'Invalid email';
    // or return a full FieldError:
    // return {type: 'format', message: 'Invalid email'};
  }}
/>
```

### Event-to-Value Transform
```tsx
<Field
  name='color'
  as='select'
  eventToValue={(e) => e.target.value}
>
  <option value='red'>Red</option>
  <option value='blue'>Blue</option>
</Field>
```
