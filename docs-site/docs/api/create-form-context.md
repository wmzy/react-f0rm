---
sidebar_position: 6
---

# createFormContext

Builds an isolated bundle of form-context bindings — its own React context plus `useField` / `useFieldArray` / `useFormContext` hooks that resolve their form from it.

## Why

The module-level `<Form>` context serves one form per subtree. Nesting two forms, or reusing a field component under a different form, makes them fight over that single context. `createFormContext` fixes the value shape once per app area and scopes each instance's provider to a strictly separate form.

## Usage

```tsx
import {createFormContext, useForm} from 'react-f0rm';

interface Values {
  name: string;
  email: string;
}

// Call once per app area (module scope) — not inside a component
const ProfileForm = createFormContext<Values>();

function NameField() {
  // name is constrained to FieldPath<Values>; value is inferred as string
  const {value, onChange, error} = ProfileForm.useField({name: 'name'});
  return (
    <div>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <span role='alert'>{error}</span>}
    </div>
  );
}

function Profile({form}: {form: ReturnType<typeof useForm<Values>>}) {
  // scopes the subtree to this form instance only
  return (
    <ProfileForm.FormProvider form={form}>
      <NameField />
    </ProfileForm.FormProvider>
  );
}
```

## Returns

`createFormContext<TValues>()` returns:

| Property | Type | Description |
|----------|------|-------------|
| `context` | `Context<Form<TValues> \| null>` | The raw React context — pass it to `<Form context={ProfileForm.context}>` so the component provides into this instance while keeping its full submit machinery (see below) |
| `FormProvider` | `ComponentType<{form: Form<TValues>; children: ReactNode}>` | Provider taking the form as a `form` prop (not a raw `value`) |
| `useFormContext()` | `() => Form<TValues>` | The form from this instance's context; throws `'no form provided'` outside a provider |
| `useField(options)` | `(options: {name: TPath} & Omit<UseFieldOptions<TValues, TPath>, 'form'>) => UseFieldResult<TValues, TPath>` | Like the global [`useField`](./use-field.md), resolved from this context — no `form` option |
| `useFieldArray(options)` | `(options: {name: FieldPath<TValues> \| Name}) => UseFieldArrayResult` | Like the global [`useFieldArray`](./use-field-array.md), resolved from this context — no `form` option |

Each call creates a **private** React context: providers and hooks from separate `createFormContext()` instances never see each other's forms, so two contexts can coexist in one tree.

## Interop with `<Form context={...}>`

The bundle carries its raw React context, so `<Form>` can provide into it while keeping its full submit machinery — validation, submit handling, focus-on-error — instead of you wiring `<FormProvider>` + `handleSubmit` by hand:

```tsx
const ProfileForm = createFormContext<Values>();

<Form context={ProfileForm.context} form={form} onValidSubmit={save}>
  <NameField /> {/* ProfileForm.useField resolves the form <Form> manages */}
  <button type="submit">Save</button>
</Form>
```

The module-level `useFormContext()` / `useField` do not see that form — that is the isolation working. See [`<Form context>`](./form.md) for the prop.
