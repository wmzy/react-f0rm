---
sidebar_position: 1
---

# Migrating from Formik

## Key Differences

| Feature | Formik | react-f0rm |
|---------|--------|------------|
| State management | React state | Event emitter |
| Re-renders | Form-level | Field-level |
| Bundle size | ~44KB | ~3KB |
| Validation | Built-in + Yup | Per-field + schema resolvers |

## Migration Steps

### 1. Replace imports
```diff
- import { Formik, Form, Field } from 'formik';
+ import { Form, Field } from 'react-f0rm';
```

### 2. Update Form props
```diff
- <Formik initialValues={...} onSubmit={...} validate={...}>
-   <Form>
+ <Form initialValues={...} onSubmit={...} validate={...}>
```

### 3. Update Field usage
```diff
- <Field name="email" />
+ <Field name="email" type="email" />
```

### 4. Replace useFormik with useForm
```diff
- const formik = useFormik({...});
+ const form = useForm({...});
+ const value = useValue(form, 'fieldName');
```
