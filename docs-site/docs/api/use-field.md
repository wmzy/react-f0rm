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
| `rules` | `FieldRules` | Declarative constraints (`required` / `min` / `max` / `minLength` / `maxLength` / `pattern`) compiled into a validator that runs before `validate` — see [Rules](#rules) |
| `validateDebounce` | `number` | Milliseconds to debounce this field's validation kicks (default `0` — validate immediately); while the timer is pending the field counts as validating, so `trigger`/submit wait out the window. Only the last kick inside the window runs |
| `delayError` | `number` | Milliseconds to hold a **newly appearing** error back from the render — render layer only, the form's error state stays immediate; only the none → some transition waits, an error cleared inside the window never shows — see [Delaying Error Display](../guides/validation.md#delaying-error-display) |
| `disabled` | `boolean` | Disable this field — OR-ed with the form-level flag (`createForm({disabled})` / `setDisabled`) into the result's `disabled`; a field cannot opt out of a disabled form |
| `shouldUnregister` | `boolean` | Remove the field on unmount (default: `true`) |

## Rules

For declarative constraints, pass `rules` instead of hand-writing a `validate` function. Rule failures land in the form's error state as `FieldError`s (`type` is the rule name) carrying your message, so any design system can render them uniformly instead of the browser's validity bubble:

```tsx
const {value, onChange, error} = useField({
  name: 'age',
  rules: {
    required: 'Age is required',
    min: 18,
    messages: {min: 'Must be an adult'}
  }
});
```

| Rule | Value | Fails when | Default message |
|------|-------|------------|-----------------|
| `required` | `string \| true` | value is `''`, `undefined` or `null` (`0` and `false` count as filled) | `'This field is required'` |
| `min` | `number` | `Number(value) < min` — values converting to `NaN` skip the rule | `` `Must be at least ${min}` `` |
| `max` | `number` | `Number(value) > max` — `NaN` skips | `` `Must be at most ${max}` `` |
| `minLength` | `number` | a string value is shorter — non-strings skip | `` `Must be at least ${n} characters` `` |
| `maxLength` | `number` | a string value is longer — non-strings skip | `` `Must be at most ${n} characters` `` |
| `pattern` | `{value: RegExp, message: string}` | `pattern.value.test(value)` is false | the given `message` |

The optional top-level `messages` record overrides messages per rule type (`min`, `max`, `minLength`, `maxLength`, `pattern`) — useful for centralizing or localizing them.

Semantics:

- A failing `required` short-circuits the rest — an empty value reports only its `required` error, not a full panel.
- Every other failing rule collects into one ordered `FieldError[]` (see [Multiple Errors per Field](../guides/validation.md#multiple-errors-per-field)).
- `rules` composes with `validate`: rules run first, then `validate` (awaited when async), merging both sources' errors with rules ahead.
- Rules ride the exact same pipeline as `validate` — `mode`, `reValidateMode`, `validateDebounce` and `meta.signal` all apply unchanged.

HTML attributes (`required`, `type='email'`, `min`, …) keep running through the browser's `checkValidity` bubble; `rules` is the state-side alternative — failures are queryable (`getErrors`, `error`, `errors`), renderable by any UI, and carry your own messages. Prefer `rules` whenever the error text must be controlled.

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
| `disabled` | `boolean` | Merged disabled flag — the form-level flag (`createForm({disabled})`, toggled by `setDisabled`) OR-ed with this field's own `disabled` option, updated live |

## Unregister Semantics

On unmount the field is removed and leaves a **tombstone**: `getValues()` omits the field instead of falling back to `initialValues`. Writing the path again (e.g. a remounted field or a rewritten parent array) revives the branch and clears the tombstone. Pass `shouldUnregister: false` to keep the value after unmount.
