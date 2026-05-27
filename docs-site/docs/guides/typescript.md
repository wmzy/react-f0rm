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

```tsx
const { value, onChange } = useField<UserForm, 'age'>({ name: 'age' });
// value is typed as number
```
