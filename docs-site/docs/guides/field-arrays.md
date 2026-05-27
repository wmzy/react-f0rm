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
          <Field name={`items.${i}.qty`} type="number" />
          <button type="button" onClick={() => remove(i)}>Remove</button>
          {i > 0 && <button type="button" onClick={() => swap(i, i - 1)}>↑</button>}
        </div>
      ))}
      <button type="button" onClick={() => append({ name: '', qty: 1 })}>
        Add Item
      </button>
    </>
  );
}
```
