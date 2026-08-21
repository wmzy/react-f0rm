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
| `form` | `Form` | Explicit form instance — wins over the context and makes the hook work outside a `<Form>` provider |

## Returns

| Property | Type | Description |
|----------|------|-------------|
| `fields` | `{ id: string; index: number }[]` | Array items with stable IDs |
| `append` | `(value: any) => void` | Add to end |
| `prepend` | `(value: any) => void` | Add to start |
| `insert` | `(index: number, value: any) => void` | Insert at index |
| `remove` | `(index: number) => void` | Remove item |
| `swap` | `(from: number, to: number) => void` | Swap two items |
| `move` | `(from: number, to: number) => void` | Move item |

## Subscription Scope

The hook subscribes with a path-prefix filter: only `change` events touching this array's branch — the array key itself or any descendant key — recompute `fields` and re-render the component. Typing into unrelated fields never re-renders the list.
