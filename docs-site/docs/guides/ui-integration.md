# UI Integration

`<Field as={…}>` already covers components that accept `value`/`onChange` (see [Custom Components](./custom-components.md)). A design system usually wants more than a wired input, though: consistent labels, its own error slots and disabled styling, its own prop names. This guide is the cookbook for bridging react-f0rm's headless state into a UI library — write the adapter once, reuse it for every control the design system ships.

## The Control Adapter Pattern

`useField` returns a plain controlled contract. An adapter's whole job is spreading that contract onto the design system's component and rendering the error in its slot:

| Binding | From `useField` | What it drives |
|---|---|---|
| `value` | the current field value | the control's display state |
| `onChange(nextValue)` | commits a value | every user edit — rides the `mode`/`reValidateMode` gating |
| `onBlur()` | blur notification | `'onBlur'`/`'onTouched'` validation timing |
| `disabled` | merged form + field flag | the control's disabled styling |
| `error` / `errors` | message string / full list | the error slot |

A generic `TextField`, no UI library involved — swap the class names for yours and it is production-ready:

```tsx
import {useField} from 'react-f0rm';

function TextField({form, name, label, validate, ...rest}) {
  const {value, onChange, onBlur, disabled, error} = useField({form, name, validate});
  const inputId = `${name}-input`;
  const errorId = `${name}-error`;
  return (
    <div className='textfield'>
      <label htmlFor={inputId}>{label}</label>
      <input
        {...rest}
        id={inputId}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <span id={errorId} className='textfield-error' role='alert'>
          {error}
        </span>
      )}
    </div>
  );
}

// Usage — validators and rules ride along like on any useField:
<TextField
  form={form}
  name='email'
  label='Email'
  data-testid='email'
  validate={v => (v.includes('@') ? undefined : 'Invalid email')}
/>
```

The one convention the wired control must honor: **`onChange` receives the next value, not a DOM event.** Unwrap events at the boundary (`e => onChange(e.target.value)`) — the same job `eventToValue` does for `Field`'s `as` prop.

For arbitrary controlled components, hoist the node into a `control` prop and the adapter stops caring which design system it serves:

```tsx
function ControlField({form, name, control: Control, ...rest}) {
  const {value, onChange, onBlur, disabled, error} = useField({form, name});
  return (
    <div className='field'>
      <Control
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        {...rest}
      />
      {error && <span role='alert'>{error}</span>}
    </div>
  );
}

<ControlField form={form} name='bio' control={SystemTextarea} maxLength={200} />
```

## Adapting a Real Design System

Nothing about the pattern changes with a real library — only the prop names and the error convention do. MUI's `TextField`, for illustration:

```tsx
import TextField from '@mui/material/TextField';

function MuiEmailField({form}) {
  const field = useField({form, name: 'email'});
  return (
    <TextField
      label='Email'
      value={field.value ?? ''}
      onChange={e => field.onChange(e.target.value)} // MUI forwards the event
      onBlur={field.onBlur}
      disabled={field.disabled}
      error={!!field.error}     // boolean flag instead of the message
      helperText={field.error}  // the message rides in helperText
    />
  );
}
```

The state contract is identical — `value`/`onChange` keep their names (unwrap `e.target.value`, as ever), and the error string maps onto MUI's boolean-plus-slot convention. Chakra, antd and Mantine differ the same way: write one adapter per control, never per form.

## `changeValue`: Bridges That Hold a Plain Setter

Some wrappers cannot mount `useField` where the control lives — a schema-driven layout that renders rows from config, a design-system `Form` that owns rendering and reports changes as a bare `(name, value)` callback, a control driven through an imperative API. For those, `changeValue` reproduces a **user change** from outside the field:

```tsx
import {changeValue, getValue} from 'react-f0rm';

<DatePicker
  value={getValue(form, 'birthDate')}
  onChange={date => changeValue(form, 'birthDate', date)}
/>
```

The write routes through the mounted field's own change pipeline, so everything a keystroke fires fires here too — `mode`/`reValidateMode` gating (per-field override included), touched marking, `validateDeps` kicks. Compare the write channels:

| Call | Semantics |
|---|---|
| `changeValue(form, name, v)` | user change — gated by `mode`/`reValidateMode` exactly like typing |
| `setValue(form, name, v)` | imperative write — no validation, no touched marking |
| `setValue(form, name, v, {shouldValidate: true})` | kicks the validator unconditionally, ignoring any mode |

The gate lives inside the mounted field's closure and cannot be rebuilt from public form state — which is why this channel exists. With no field mounted at the path, `changeValue` degrades to a plain `setValue`.

## Performance

- **Memoize row components, keep props stable.** A list re-renders whenever its branch changes; `React.memo` on the row component plus stable props (`form`, the row's `id` — never an inline `value` or a fresh closure) keeps one row's edit from re-rendering its siblings.
- **Scope array rows with `useFieldArrayItem`.** `useFieldArray` subscribes to the whole branch; the per-row hook scopes the subscription to one row so editing row K re-renders only row K. Pair it with the memoized row above — see [Field Arrays](./field-arrays.md#re-render-scope).
- **Compare derived watches with `isEqual`.** `useWatch` re-renders when its getter's return changes by `Object.is`; a getter that builds a fresh object every call (a derived aggregate, say) re-renders on every wake. Pass the fourth argument to compare what actually matters:

```tsx
const summary = useWatch(
  form.emitter,
  'change',
  () => {
    const {items} = getValues(form);
    return {count: items.length, total: items.reduce((n, i) => n + i.qty, 0)};
  },
  (prev, next) => prev.count === next.count && prev.total === next.total
);
```

Typing a quantity still wakes the component, but the render is skipped unless the aggregate moved.

## Focus

`setFocus(form, name)` and a failed submit's first-error auto-focus (`shouldFocusError`, on by default) reach a field only through the `focusRef` `useField` returns — a callback ref meant for the focusable element inside your adapter:

```tsx
function TextField({form, name}) {
  const {value, onChange, focusRef} = useField({form, name});
  return (
    <input
      ref={focusRef}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}
```

Spread it onto the innermost focusable node. A headless control that never binds `focusRef` makes focus requests aimed at it silent no-ops — `setFocus`'s contract: focusing a field whose element is not bound neither throws nor focuses anything. Design-system components that forward refs work as-is (`<Control ref={focusRef} … />`); those that swallow the ref usually expose an escape hatch (`inputRef`) — thread `focusRef` through it. `<Field>` performs this wiring for its own input automatically; on the headless path it is yours to wire.
