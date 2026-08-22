---
sidebar_position: 7
---

# Schema Resolvers

Adapters for popular validation libraries. Tree-shakeable — only imported resolvers are bundled.

## Zod

```tsx
import { zodResolver } from 'react-f0rm/resolvers/zod';
import { z } from 'zod';

const schema = z.string().min(1, 'Required').email('Invalid email');

<Field name="email" validate={zodResolver(schema)} />
```

## Yup

```tsx
import { yupResolver } from 'react-f0rm/resolvers/yup';
import * as yup from 'yup';

const schema = yup.string().required('Required').email('Invalid email');

<Field name="email" validate={yupResolver(schema)} />
```

## Standard Schema

One adapter for every library implementing the
[Standard Schema](https://standardschema.dev) spec — zod v3.24+/v4, valibot v1,
arktype, and more:

```tsx
import {
  standardSchemaResolver,
  standardSchemaFormValidator
} from 'react-f0rm/resolvers/standard-schema';

// Field-level validation (zod shown; any ~standard schema works)
<Field name="email" validate={standardSchemaResolver(z.string().email())} />
```

### Form-level validation

`standardSchemaFormValidator` drives whole-form validation from a single
object schema — issue paths are mapped onto field names automatically:

```tsx
import {createForm} from 'react-f0rm';

const form = createForm({
  initialValues: {name: '', email: ''},
  validate: standardSchemaFormValidator(
    z.object({
      name: z.string().min(1, 'Required'),
      email: z.string().email('Invalid email')
    })
  )
});
```

Issues without a path (form-level errors) are set on the `_form` key.
