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

`FieldPath<T>` enumerates every valid path string for a values shape (dot notation, array indices, bracket subscripts — capped at 10 segments). `PathValue<T, P>` resolves the value type a path points at. Past the 10-segment cap a literal stops being a `FieldPath` member, so it is rejected on the generic APIs; spell deeper paths as segment arrays (`['a', 'b', …, 'leaf']`), which stay accepted and read as `any`:

```tsx
import type { FieldPath, PathValue } from 'react-f0rm';

interface Values {
  user: { name: string };
  tags: string[];
}

type P = FieldPath<Values>;
// 'user' | 'user.name' | 'tags' | `tags[0]` | ...

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

Paths accept dot notation for object keys and bracket subscripts for array indices (`'user.name'`, `'tags[0]'`). Numeric segments are bracket-only: dotted `'tags.0'` throws a `TypeError` at runtime (the message suggests the bracket spelling) and is not a `FieldPath` member. Quoted subscripts (`a['b c']`, and `items["0"]` to explicitly name a string key rather than an index) are supported by the runtime path parser but are not enumerated by `FieldPath`. When `T` is `any` (the default), paths fall back to plain `string` and values to `any`, so untyped usage keeps working.

## Typed Errors (`FieldErrors<T>`)

`useErrors(form)` and `useFormState(form).errors` return `FieldErrors<T>` — react-hook-form's typed `formState.errors` counterpart. Keys are resolved from the values shape (per-key values are `FieldError[] | undefined`), and they follow the **runtime** key form: dot-joined dotted paths, arrays included — `'user.name'`, `'tags.0'` (the record joins segments with dots, so bracket spelling `'tags[0]'` is not a record key). The reserved `_form` slot for form-level errors is typed too:

```tsx
const errors = useErrors(form); // FieldErrors<Values>

errors.email;              // FieldError[] | undefined — typo'd keys fail at compile time
errors['tags.0'];          // array rows use the dotted form
errors['_form'];           // the FORM_ERROR slot
```

## Opaque Leaves (`OpaqueTypes`)

Date/Dayjs/class-instance values are values, not field trees — but structurally they are objects, so path recursion would descend into them. The opt-in registry stops it (react-hook-form 7.87's same-named registry):

```tsx
declare module 'react-f0rm' {
  interface OpaqueTypes {
    dayjs: Dayjs;
  }
}

// 'createdAt' is now a leaf: 'createdAt.year' is not a FieldPath and
// PathValue<Values, 'createdAt'> resolves to Dayjs.
```
