# Field Arrays

Use `useFieldArray` to manage dynamic lists of fields.

```tsx
import { useFieldArray, Field } from 'react-f0rm';

function Items() {
  const { fields, append, remove, swap } = useFieldArray({ name: 'items' });

  return (
    <>
      {fields.map((field, i) => (
        <div key={field.id}>
          <Field name={`items.${i}.name`} />
          <Field name={`items.${i}.qty`} type='number' />
          <button type='button' onClick={() => remove(i)}>Remove</button>
          {i > 0 && <button type='button' onClick={() => swap(i, i - 1)}>↑</button>}
        </div>
      ))}
      <button type='button' onClick={() => append({ name: '', qty: 1 })}>
        Add Item
      </button>
    </>
  );
}
```

## Re-render Scope

`useFieldArray` subscribes with a path-prefix filter: only changes touching the array's branch — the array key itself or any descendant key — recompute `fields` and re-render the component. Typing into unrelated fields elsewhere in the form never re-renders the list.
