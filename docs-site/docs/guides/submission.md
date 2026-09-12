---
sidebar_position: 4
---

# Submission Handling

## Submit Callbacks

```tsx
<Form
  initialValues={{ name: '' }}
  onSubmit={(values) => console.log('Submitted:', values)}
  onValidSubmit={(values) => saveToAPI(values)}
  onInvalidSubmit={(errors, values) => showErrors(errors)}
>
```

`onInvalidSubmit` receives `(errors, values)` where `errors` is a flattened array of `{path, type, message}` entries in insertion order — `path` is the dotted field path (`'a.b'`, `'list.0'`), `type` the error kind (`'custom'` for plain string errors, `'native'` for failed DOM constraint validation, `'server'` for server backfill), `message` the display text.

Order on success: validation passes → `onSubmit` → `onValidSubmit` → `action` (React 19 Server Actions — see the [guide](./react19-server-actions.md)). Any handler may be async; `isSubmitting` covers the whole flight.

## Headless `handleSubmit`

The same flow exists as a standalone function — the headless counterpart of `<Form>`'s submit wiring, for call sites with no `<form>` element (React Native, toolbar buttons):

```tsx
import {useForm, handleSubmit} from 'react-f0rm';

function Profile({onSave}) {
  const form = useForm({initialValues: {email: ''}});
  return (
    <Button
      title="Save"
      onPress={handleSubmit(form, {
        onSubmit: values => onSave(values),
        onInvalidSubmit: errors => console.error(errors)
      })}
    />
  );
}
```

The returned handler runs the full submit state machine (`isSubmitting`, `submitCount`, `isSubmitSuccessful`, `isSubmitted`) and accepts an optional event object — when it carries a `<form>`-like `currentTarget`, native constraint validation gates first (see below); targets without `checkValidity` never gate.

## Native Validation Gate

`<Form>` always renders its `<form>` with `noValidate`, suppressing the browser's built-in blocked-submit UI — but native constraint validation still gates submission:

1. On submit, the form element's `checkValidity()` runs **before** custom validators.
2. If a native constraint fails (`required`, `type=email`, `minLength`, …), `reportValidity()` surfaces the offending constraint as a native bubble, `onInvalidSubmit` fires (with `type: 'native'` entries), and submission stops.
3. `onSubmit` / `onValidSubmit` only run once every native constraint passes *and* custom validation succeeds.

`Field` components also push their custom error message into the input via `setCustomValidity`, so custom errors surface through the same native bubble UI.

### `shouldUseNativeValidation`

For custom-validator-only forms the native gate is pure overhead — disable it:

```tsx
const form = useForm({shouldUseNativeValidation: false});
// or per component: <Form shouldUseNativeValidation={false}>
```

With the flag off, `checkValidity()`/`reportValidity()` stop gating submits, and a bound `<Field>` no longer skips its custom validator when native constraints fail that kick — your validators become the only verdict (react-hook-form's `shouldUseNativeValidation` parity). Declarative `rules` still produce store-side errors and still render as native constraint attributes for a11y/`:invalid` styling. The flag is fixed at create time; a single attempt may override it through `handleSubmit(form, {shouldUseNativeValidation: false})` — the save-draft button whose submit must ignore unfilled native constraints while custom validators still run.

## Focusing the First Error

After a failed submit the offending field is focused automatically — pass `shouldFocusError: false` (on `<Form>` or `handleSubmit`) to disable; it defaults to `true`. Custom validation failures focus the first errored field through the `'focusError'` event bound fields subscribe to; native failures focus the submitted form's first `:invalid` control directly. The same channel is exposed imperatively:

```tsx
import {setFocus} from 'react-f0rm';

setFocus(form, 'email');                            // focus the bound field's element
setFocus(form, 'user.name', {shouldSelect: true});  // focus and select its text
```

`setFocus` rides the `'focusError'` channel, so it is a silent no-op when the field is unmounted or nothing binds `focusRef` — unknown names never throw.

## Submission State

```tsx
import {useFormContext, useCanSubmit, useIsValidating, useIsSubmitSuccessful} from 'react-f0rm';

function SubmitButton() {
  const form = useFormContext();
  const canSubmit = useCanSubmit(form);       // !isSubmitting && !hasErrors
  const isValidating = useIsValidating(form); // any async round in flight

  return (
    <button type='submit' disabled={!canSubmit || isValidating}>
      {isValidating ? 'Checking...' : isSubmitting ? 'Saving...' : 'Save'}
    </button>
  );
}
```

- `useCanSubmit(form)` — the single flag a submit button's `disabled` prop wants: `false` for the whole async `onSubmit` span (not just the validation pass) and whenever any field holds an error (client validation or server backfill). Deliberately no dirty or validating semantics — an untouched-but-clean form can submit. Combine with `useIsValidating` for the stricter gate.
- `useIsValidating(form)` — `true` while any field's async validator or pending debounce window is open, and while the form-level validate round is in flight. The classic spinner / double-click guard.
- `useIsSubmitSuccessful(form)` — `true` once `onSubmit`/`onValidSubmit` resolved without throwing, `false` when validation failed or a handler threw, `undefined` before the first submit — the success-banner/redirect trigger.
- `useIsSubmitting(form)` / `useSubmitCount(form)` — the raw flags.

`reset(form)` clears the submission state too: `isSubmitting` → `false`, `submitCount` → `0`, `isSubmitted` → `false`, `isSubmitSuccessful` → `undefined` (along with values, errors, touched and validating state); `keepSubmitCount`/`keepIsSubmitted`/`keepIsSubmitSuccessful`/`keepIsSubmitting` preserve individual flags through the reset.

## Duplicate Submit Protection

Submission is single-flight: `isSubmitting` flips to `true` synchronously before validation even starts, and any attempt that arrives while a round is pending — a double click, or a `handleSubmit` call nested inside `onSubmit` — is ignored outright, with no state changes at all (no `submitCount` bump, no server-error clearing). Once the round settles, successful or not, the next attempt runs normally.

Don't reach for `form.disabled` / `<Form disabled>` to block the button — that flag only disables inputs, not submission. Bind the button itself to `useCanSubmit` (plus `useIsValidating` for the stricter gate) so the UI reflects the in-flight window the same way the guard does.

## Server Rejection

A server 422 lands on the same channel client-side validation uses — see [Server-side Errors](./validation.md#server-side-errors) for `setServerErrors`, and the [Server Actions guide](./react19-server-actions.md) for the `<Form action>` round trip.
