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
| `validate` | `(value, meta) => string \| FieldError \| undefined` | Field-level validator; strings are normalized to `{type: 'custom', message}`. With a typed `form` + `name`, `value` is inferred as `PathValueOf<Values, P>`; dynamic or untyped names keep it `any` (see [Typing](#typing)) |
| `rules` | `FieldRules` | Declarative constraints (`required` / `min` / `max` / `minLength` / `maxLength` / `pattern`) compiled into a validator that runs before `validate` — see [Rules](../guides/validation.md#rules) |
| `validateDebounce` | `number` | Milliseconds to debounce this field's validation kicks (default: `0`); while pending, the field counts as validating so `trigger`/submit wait out the window — see [Async Validation](../guides/validation.md#async-validation) |
| `delayError` | `number` | Milliseconds to hold a newly appearing error back from the render — `aria-invalid` and `renderError` wait out the window while the form's error state stays immediate — see [Delaying Error Display](../guides/validation.md#delaying-error-display) |
| `disabled` | `boolean` | Disable the control — OR-ed with the form-level flag (`createForm({disabled})` / `setDisabled`); passing `false` cannot opt a field out of a disabled form |
| `initialValue` | `any` | Override initial value |
| `eventToValue` | `(event) => any` | Transform event to value |
| `valueToProps` | `(value) => object` | Transform value to props |
| `renderError` | `(error: string, id: string) => ReactNode` | Optional error renderer (see [Error Rendering & Accessibility](#error-rendering--accessibility)) |
| `form` | `Form<TValues>` | Explicit form instance — skips the form context, works without a `<Form>` provider. With a typed form (`Form<Values>`) and a typed `name`, the `validate` value argument is inferred (see [Typing](#typing)) |
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

The following props are **consumed** by `Field` and will **not** be forwarded: `name`, `as`, `asProps`, `validate`, `rules`, `validateDebounce`, `delayError`, `disabled`, `initialValue`, `eventToValue`, `valueToProps`, `renderError`, `form`, `shouldUnregister`.

The component rendered via `as` receives:
- `value` — the current field value
- `onChange` — call to update the value
- All forwarded props

## Error Rendering & Accessibility

When a field has an error, `Field` (and `Checkbox`/`Select`) sets `aria-invalid` on the rendered control automatically **and** appends `fieldErrorId(name)` to its `aria-describedby` — the id the error message element is expected to carry. `fieldErrorId` is exported, so a custom error component only needs to render that id with `role='alert'` to complete the chain for screen readers:

```tsx
import {useFormContext, useError, fieldErrorId} from 'react-f0rm';

function FieldMessage({name}) {
  const form = useFormContext();
  const error = useError(form, name);
  return error ? (
    <span id={fieldErrorId(name)} role='alert' className='field-error'>
      {error}
    </span>
  ) : null;
}

<Field name='email' placeholder='Email' />
<FieldMessage name='email' />
```

For the built-in path, pass `renderError` instead. When the field has an error, `Field` renders:

```tsx
<span id={id} role='alert'>{renderError(error, id)}</span>
```

next to the input — same id (`fieldErrorId(name)`, derived from the field path, e.g. `'todos[0]'` → `'todos-0'`), same wiring, no extra component. `renderError` receives the error **message string** and the generated `id`.

```tsx
<Field
  name='email'
  placeholder='Email'
  renderError={(error) => <em className='field-error'>{error}</em>}
/>
```

Without `renderError` no extra element is rendered — but the `aria-describedby` → `fieldErrorId(name)` wiring still applies on error, so a custom error component anywhere in the tree (a design-system `FormItem`, a shared `FieldMessage`) is pointed at without any coordination. A user-provided `aria-describedby` survives: the error id is appended after yours. Without an error, no `aria-describedby` is added.

`Field` also stays in sync with the browser's constraint validation API: the current error message is pushed to the input via `setCustomValidity`, and native constraints (`required`, `type=email`, `minLength`, …) are checked before your `validate` function — a failing native constraint surfaces as a native bubble and skips custom validation for that pass.

## Typing

A `Field` tied to a typed form infers its `validate` value argument from the path — `PathValueOf<Values, P>` — via the `form` prop (a plain `string` name keeps the old permissive `any`, matching `useField`). `Checkbox` and `Select` share the same contract:

```tsx
const form = useForm<Values>();

<Form form={form} initialValues={{email: ''}}>
  <Field
    form={form}
    name="email"
    validate={value => (value.includes('@') ? undefined : 'Invalid email')}
  />
  {/* nested paths resolve through the shape: string | undefined */}
  <Field
    form={form}
    name="user.bio"
    validate={value => (value === undefined ? 'Tell us something' : undefined)}
  />
</Form>
```

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
