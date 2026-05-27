---
sidebar_position: 6
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
