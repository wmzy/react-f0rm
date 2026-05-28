---
sidebar_position: 5
---

# Custom Components

The `as` prop lets you use any component as a form field — not just native `<input>`. All extra props are forwarded automatically.

## How It Works

`Field` consumes a fixed set of props (`name`, `as`, `validate`, `initialValue`, `eventToValue`, `valueToProps`). Everything else passes through to your component:

```tsx
<Field
  name="description"
  as={RichTextEditor}
  theme="dark"        // → forwarded
  maxLength={1000}    // → forwarded
  placeholder="..."   // → forwarded
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
<Field name="bio" as="textarea" rows={4} className="bio-input" />
<Field name="color" as="select" eventToValue={(e) => e.target.value}>
  <option value="red">Red</option>
  <option value="blue">Blue</option>
</Field>
```

## Third-Party Components

Most third-party input components work out of the box if they accept `value` and `onChange`:

```tsx
import ReactSelect from 'react-select';

<Field
  name="country"
  as={ReactSelect}
  options={[
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
  ]}
  isClearable
  placeholder="Select..."
/>
```

## Transforming Events

If your component's `onChange` doesn't call `onChange(value)` directly, use `eventToValue`:

```tsx
// react-select calls onChange(option) — extract the value
<Field
  name="country"
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
  name="notifications"
  as={ToggleSwitch}
  valueToProps={(value) => ({ checked: value })}
  eventToValue={(e) => e.target.checked}
/>
```

## Validation with Custom Components

`validate` works the same way — it receives the current value:

```tsx
<Field
  name="tags"
  as={TagInput}
  validate={(tags) => {
    if (tags.length === 0) return 'At least one tag required';
    if (tags.length > 5) return 'Max 5 tags';
  }}
/>
```

## forwardRef Support

`Field` forwards refs to the rendered component. If you're building a custom component, use `forwardRef` to expose the DOM node:

```tsx
const MyInput = React.forwardRef(function MyInput({ value, onChange, ...props }, ref) {
  return <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} {...props} />;
});

// Now refs work
const ref = useRef();
<Field name="email" as={MyInput} ref={ref} />
```
