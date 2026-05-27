---
sidebar_position: 5
---

# useFieldArray Hook

Manages array fields with stable IDs.

## Usage

```tsx
function TodoList() {
  const { fields, append, remove } = useFieldArray({ name: 'todos' });
  return (
    <div>
      {fields.map((field, index) => (
        <div key={field.id}>
          <Field name={`todos.${index}`} />
          <button onClick={() => remove(index)}>Remove</button>
        </div>
      ))}
      <button onClick={() => append('')}>Add</button>
    </div>
  );
}
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Array field name |
| `form` | `Form` | Form instance (optional) |

## Returns

| Property | Type | Description |
|----------|------|-------------|
| `fields` | `{ id: string; index: number }[]` | Array items with stable IDs |
| `append` | `(value: any) => void` | Add to end |
| `prepend` | `(value: any) => void` | Add to start |
| `insert` | `(index: number, value: any) => void` | Insert at index |
| `remove` | `(index: number) => void` | Remove at index |
| `swap` | `(from: number, to: number) => void` | Swap two items |
| `move` | `(from: number, to: number) => void` | Move item |
