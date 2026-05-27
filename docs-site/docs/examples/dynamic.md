---
sidebar_position: 3
---

# Dynamic Fields

```tsx
import { Form, Field, useFieldArray } from 'react-f0rm';

function TodoList() {
  const { fields, append, remove } = useFieldArray({ name: 'todos' });

  return (
    <div>
      {fields.map((field, i) => (
        <div key={field.id}>
          <Field name={`todos.${i}`} placeholder={`Todo #${i + 1}`} />
          <button type="button" onClick={() => remove(i)}>✕</button>
        </div>
      ))}
      <button type="button" onClick={() => append('')}>
        Add Todo
      </button>
    </div>
  );
}

export default function DynamicForm() {
  return (
    <Form
      initialValues={{ todos: ['Learn react-f0rm'] }}
      onSubmit={(values) => console.log(values)}
    >
      <TodoList />
      <button type="submit">Save</button>
    </Form>
  );
}
```
