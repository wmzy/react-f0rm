---
sidebar_position: 11
---

# Headless Usage & React Native

Every state capability ships headless: `useField`, `handleSubmit`, `useFieldArray`, `subscribe`/`watch`, `useTransform` and the whole core (`createForm` + the `get*`/`set*` functions) never touch the DOM. The bound components (`Field`, `Checkbox`, `Select`, `Form`) are thin DOM adapters on top of the same hooks. Non-DOM surfaces — React Native, custom design systems, canvas UIs — consume the headless layer directly.

## The Headless Contract

`useField({name})` returns `{value, onChange, onBlur, error, errorObject, errors, isDirty, validating, disabled, name, form, focusRef}`:

```tsx
import {useField} from 'react-f0rm';

function CustomField({form, name}: {form: Form<{email: string}>; name: 'email'}) {
  const {value, onChange, onBlur, error, errorObject, focusRef} = useField({form, name});
  return (
    <div>
      <input
        ref={focusRef}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {error && <span role='alert'>{error}</span>}
    </div>
  );
}
```

Notes for headless callers:

- **`onChange(v)` takes the value, not the event** — your adapter unwraps it (`e.target.value`, a picker's selection, an editor's doc). `onBlur()` takes nothing.
- **`focusRef` is the focus channel.** `setFocus` and a failed submit's first-error auto-focus (`shouldFocusError`) ride the `'focusError'` event, which reaches your element through this callback ref. Leave it off and focus requests aimed at the field are silent no-ops. Bind it to the innermost focusable node.
- **`uncontrolled: true`** pins `value` at mount and skips the value subscription — typing re-renders nothing (react-hook-form `register` model); bind the element with `defaultValue`, read live values through `useValue`/`getValues`.
- Validation, touched, disabled, dirty — every other signal is identical to the DOM path, because `<Field>` is only a wrapper over this hook.

## No `<form>` Element: `handleSubmit`

`handleSubmit(form, options)` runs the full submit state machine without a DOM target — the headless counterpart of `<Form>`'s submit wiring:

```tsx
import {useForm, handleSubmit} from 'react-f0rm';

function Profile({onSave}: {onSave: (v: ProfileValues) => void}) {
  const form = useForm<ProfileValues>({initialValues: {email: ''}});
  return (
    <Button
      title='Save'
      disabled={!useCanSubmit(form)}
      onPress={handleSubmit(form, {
        onSubmit: values => onSave(values),
        onInvalidSubmit: errors => console.error(errors)
      })}
    />
  );
}
```

When the event object carries a `<form>`-like `currentTarget`, native constraint validation gates first; targets without `checkValidity` — React Native, toolbar buttons — are automatically exempt (the `shouldUseNativeValidation` flag is irrelevant off the DOM).

## React Native

The same hook binds a `TextInput`:

```tsx
import {useField, useForm} from 'react-f0rm';
import {TextInput, Text, View, Pressable} from 'react-native';

function EmailStep() {
  const form = useForm({
    initialValues: {email: '', bio: ''},
    mode: 'onBlur',
    validate: values =>
      values.email.includes('@') ? undefined : {email: 'Invalid email'}
  });

  const email = useField({form, name: 'email'});
  const bio = useField({form, name: 'bio'});

  return (
    <View>
      <TextInput
        ref={email.focusRef}
        value={email.value ?? ''}
        onChangeText={email.onChange}
        onBlur={email.onBlur}
        placeholder='Email'
      />
      {email.error && <Text role='alert'>{email.error}</Text>}

      <TextInput
        value={bio.value ?? ''}
        onChangeText={bio.onChange}
        placeholder='Bio'
        multiline
      />

      <Pressable
        disabled={!canSubmit} // useCanSubmit(form)
        onPress={handleSubmit(form, {onSubmit: save})}
      >
        <Text>Save</Text>
      </Pressable>
    </View>
  );
}
```

What carries over unchanged: mode/`reValidateMode` timing, `validateDebounce` + `meta.signal` cancellation, `rules` (store-side verdicts — the native-attribute rendering is a DOM-only extra), touched/dirty tracking, `useFieldArray` row management, `setFocus`. `useTransform` binds pickers/selects whose display value differs from the stored value; `useFieldArrayItem` scopes array rows. Everything in [Hooks Reference](./hooks-reference.md) applies off the DOM as-is.
