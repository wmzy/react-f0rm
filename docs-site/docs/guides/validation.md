# Validation

## Field-level Validation

Pass a `validate` function to `<Field>`. It may return a plain message string (normalized to `{type: 'custom', message}`) or a full `FieldError`:

```tsx
<Field
  name='email'
  validate={(value) => {
    if (!value) return 'Required';
    if (!value.includes('@')) return {type: 'format', message: 'Invalid email'};
  }}
/>
```

The validator receives `(value, meta)` where `meta` is `{form, path}`. Async validators (returning a Promise) are supported; concurrent runs are locked to the latest one.

## Form-level Validation

Pass a `validate` function to `<Form>` (or `useForm`). The result may be **nested** — nested objects are flattened onto field paths, so `{user: {name: 'Required'}}` sets the error on `'user.name'`. Array values contribute their first non-empty string (zod `flatten()` formErrors style). Falsy leaves are skipped:

```tsx
<Form
  initialValues={{ password: '', confirm: '' }}
  validate={(values) => {
    if (values.password !== values.confirm) {
      return { confirm: 'Passwords must match' };
    }
    return {};
  }}
>
```

## Schema Validation

Use the Zod or Yup resolvers at field level:

```tsx
import { zodResolver } from 'react-f0rm/resolvers/zod';
import { z } from 'zod';

const emailSchema = z.string().email('Invalid email');

<Field name='email' validate={zodResolver(emailSchema)} />
```

### Standard Schema

One adapter covers every library implementing the [Standard Schema](https://standardschema.dev) spec — zod v3.24+/v4, valibot v1, arktype, and more. Import from `react-f0rm/resolvers/standard-schema`:

```tsx
import {Form, useForm} from 'react-f0rm';
import {
  standardSchemaResolver,
  standardSchemaFormValidator
} from 'react-f0rm/resolvers/standard-schema';
import { z } from 'zod';

// Field-level: validate one value with any ~standard schema
<Field name='email' validate={standardSchemaResolver(z.string().email('Invalid email'))} />

// Form-level: validate the whole values object with one object schema
const schema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
});

function Example() {
  const form = useForm({
    initialValues: { name: '', email: '' },
    validate: standardSchemaFormValidator(schema),
  });
  return <Form form={form}>{/* ... */}</Form>;
}
```

`standardSchemaFormValidator` maps issue paths onto field names automatically (nested paths become nested errors that the form-level flattening resolves per field); issues without a path are form-level errors on the `_form` key. Errors carry `type: 'standard'`.

See [Schema Resolvers](../api/resolvers.md) for details.

## Validation Timing

- `validateOnChange: true` — validate on every keystroke
- `validateOnBlur: true` — validate when field loses focus
- `revalidateOnChange: true` (default) — re-validate when value changes after first error
- `revalidateOnBlur: true` — re-validate on blur after first error

## Reading Errors

Errors are stored as `FieldError` objects (`{type, message}`):

- `getError(form, 'email')` → `FieldError | undefined`
- `useField(...).error` → the message **string**; `.errorObject` → the full `FieldError`
- `getErrors(form)` → flattened `{path, type, message}[]` (insertion order)
- `getFirstError(form)` → the first error's message string
