---
sidebar_position: 5
---

# Custom Components

The `as` prop lets you use any component as a form field — not just native `<input>`. All extra props are forwarded automatically.

## How It Works

`Field` consumes a fixed set of props (`name`, `as`, `asProps`, `validate`, `initialValue`, `eventToValue`, `valueToProps`, `renderError`, `form`, `shouldUnregister`). Everything else passes through to your component. If a prop name conflicts with Field's own props, use `asProps` (see [Prop Name Conflicts](#prop-name-conflicts)).

```tsx
<Field
  name='description'
  as={RichTextEditor}
  theme='dark'        // → forwarded
  maxLength={1000}    // → forwarded
  placeholder='...'   // → forwarded
/>
```

Your component receives `value`, `onChange`, and all forwarded props:

```tsx
function RichTextEditor({ value, onChange, theme, maxLength, placeholder }) {
  return (
    <div className={`editor ${theme}`}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
      />
    </div>
  );
}
```

## Native Elements

Use a string for native elements:

```tsx
<Field name='bio' as='textarea' rows={4} className='bio-input' />
<Field name='color' as='select' eventToValue={(e) => e.target.value}>
  <option value='red'>Red</option>
  <option value='blue'>Blue</option>
</Field>
```

## Third-Party Components

Most third-party input components work out of the box if they accept `value` and `onChange`:

```tsx
import ReactSelect from 'react-select';

<Field
  name='country'
  as={ReactSelect}
  options={[
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
  ]}
  isClearable
  placeholder='Select...'
/>
```

## Transforming Events

If your component's `onChange` doesn't call `onChange(value)` directly, use `eventToValue`:

```tsx
// react-select calls onChange(option) — extract the value
<Field
  name='country'
  as={ReactSelect}
  eventToValue={(option) => option?.value}
  options={countries}
/>
```

## Transforming Value Display

If your component expects props instead of a `value` prop, use `valueToProps`:

```tsx
// A toggle component that uses `checked` instead of `value`
<Field
  name='notifications'
  as={ToggleSwitch}
  valueToProps={(value) => ({ checked: value })}
  eventToValue={(e) => e.target.checked}
/>
```

## Validation with Custom Components

`validate` works the same way — it receives the current value and may return a message string or a `FieldError`:

```tsx
<Field
  name='tags'
  as={TagInput}
  validate={(tags) => {
    if (tags.length === 0) return 'At least one tag required';
    if (tags.length > 5) return 'Max 5 tags';
  }}
/>
```

## Rendering Errors

By default `Field` only sets `aria-invalid` on the rendered component and stays headless. Pass `renderError` to render the message inline — Field wraps it in `<span id={id} role='alert'>` and wires the input's `aria-describedby` to it automatically (see [Field API](../api/field.md#error-rendering--accessibility)):

```tsx
<Field
  name='country'
  as={ReactSelect}
  renderError={(error) => <em className='select-error'>{error}</em>}
/>
```

## Prop Name Conflicts

If your custom component has a prop with the same name as one of Field's consumed props (e.g., `validate`, `name`, `initialValue`), use `asProps` to pass it explicitly. `asProps` values are merged after `...rest`, so they take priority:

```tsx
function MyComponent({ validate, ...props }) {
  // validate here is MyComponent's own prop, not Field's validator
  return <div>{validate ? 'Enabled' : 'Disabled'}</div>;
}

// Without asProps — `validate` is consumed by Field, never reaches MyComponent
<Field name='feature' as={MyComponent} validate={someValue} />  // wrong!

// With asProps — `validate` is forwarded directly to MyComponent
<Field
  name='feature'
  as={MyComponent}
  validate={(v) => !v && 'Required'}  // Field's validator
  asProps={{ validate: someValue }}    // forwarded to MyComponent
/>
```

Merge order onto the rendered component: `aria-invalid`/`aria-describedby` first, then `{...rest}`, then `{...asProps}`, then `value` (or the `valueToProps` spread), then `onChange` — `asProps` overrides `rest`, and `value`/`onChange` always win.

## forwardRef Support

`Field` forwards refs to the rendered component. If you're building a custom component, use `forwardRef` to expose the DOM node:

```tsx
const MyInput = React.forwardRef(function MyInput({ value, onChange, ...props }, ref) {
  return <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} {...props} />;
});

// Now refs work
const ref = useRef();
<Field name='email' as={MyInput} ref={ref} />
```
