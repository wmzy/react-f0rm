# TypeScript Usage

react-f0rm is written in TypeScript with full type coverage.

## Typed Forms

```tsx
interface UserForm {
  name: string;
  email: string;
  age: number;
}

<Form<UserForm>
  initialValues={{ name: '', email: '', age: 0 }}
  onValidSubmit={(values) => {
    // values is typed as UserForm
    console.log(values.name);
  }}
>
```

## Typed useField

`useField` takes the values shape and a path; the returned `value` is resolved to the exact type at that path:

```tsx
const { value, onChange } = useField<UserForm, 'age'>({ name: 'age' });
// value is typed as number
```

## FieldPath and PathValue

`FieldPath<T>` enumerates every valid path string for a values shape (dot notation, array indices, bracket subscripts — capped at 10 segments). `PathValue<T, P>` resolves the value type a path points at:

```tsx
import type { FieldPath, PathValue } from 'react-f0rm';

interface Values {
  user: { name: string };
  tags: string[];
}

type P = FieldPath<Values>;
// 'user' | 'user.name' | 'tags' | 'tags.0' | 'tags[0]' | ...

type V = PathValue<Values, 'user.name'>; // string
```

They power the generics on `useField`, `getValue`, `setValue`, `getError`, `setError`, `useValue` and `useError` — a typo'd path is a compile error:

```tsx
const { value } = useField<Values, 'user.name'>({ name: 'user.name' });
// value: string

getValue(form, 'user.name');  // string
setValue(form, 'user.name', 'Ann');  // value must be a string
// setValue(form, 'user.name', 42);  // compile error
```

Paths accept dot notation and bracket subscripts (`'tags.0'`, `'tags[0]'`) — both index forms are valid `FieldPath` members for array types. Quoted subscripts (`a['b c']`) are supported by the runtime path parser but are not enumerated by `FieldPath`. When `T` is `any` (the default), paths fall back to plain `string` and values to `any`, so untyped usage keeps working.
