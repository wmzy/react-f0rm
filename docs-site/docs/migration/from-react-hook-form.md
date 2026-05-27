---
sidebar_position: 2
---

# Migrating from React Hook Form

## Key Differences

| Feature | React Hook Form | react-f0rm |
|---------|----------------|------------|
| Registration | `register()` | `<Field>` or `useField` |
| Validation | Schema-first | Per-field + schema resolvers |
| State | Isolated per field | Event-driven shared state |
| Bundle size | ~8KB | ~3KB |

## Migration Steps

### 1. Replace imports
```diff
- import { useForm } from 'react-hook-form';
+ import { Form, Field, useForm } from 'react-f0rm';
```

### 2. Replace register with Field
```diff
- <input {...register('email')} />
+ <Field name="email" />
```

### 3. Replace resolver
```diff
- import { zodResolver } from '@hookform/resolvers/zod';
+ import { zodResolver } from 'react-f0rm/resolvers/zod';
```
