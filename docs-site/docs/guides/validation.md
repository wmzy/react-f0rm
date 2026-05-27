# Validation

## Field-level Validation

Pass a `validate` function to `<Field>`:

```tsx
<Field
  name="email"
  validate={(value) => {
    if (!value) return 'Required';
    if (!value.includes('@')) return 'Invalid email';
  }}
/>
```

## Form-level Validation

Pass a `validate` function to `<Form>`:

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

Use Zod or Yup resolvers:

```tsx
import { zodResolver } from 'react-f0rm/resolvers/zod';
import { z } from 'zod';

const emailSchema = z.string().email('Invalid email');

<Field name="email" validate={zodResolver(emailSchema)} />
```

## Validation Timing

- `validateOnChange: true` — validate on every keystroke
- `validateOnBlur: true` — validate when field loses focus
- `revalidateOnChange: true` (default) — re-validate when value changes after first error
