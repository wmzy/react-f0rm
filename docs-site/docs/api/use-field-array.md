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
| `keyName` | `string` | Property name the stable row key is exposed under on each `fields` entry — defaults to `'id'`; a custom name (e.g. `'key'`) avoids clashing with a row data field of the same name |
| `rules` | `FieldRules` | Declarative rules validated against the whole array: `required` fails on an empty array, `minLength`/`maxLength` read the array's length. Checked on submit and `trigger`, like every registered validator |
| `shouldUnregister` | `boolean` | Whether unmounting this array removes its branch. Defaults to the form-level `shouldUnregister` — tombstone (drop values) like a bound field's unmount; pass `false` to keep the values |

## Returns

Declare the row type and every mover checks its value argument:
`useFieldArray<Item>({name})` types `append`/`prepend`/`insert`/`replace`/`update` against the element type (unparameterized calls keep `any`).

| Property | Type | Description |
|----------|------|-------------|
| `fields` | `{ id: string; index: number }[]` | Array items with stable IDs |
| `append` | `(value: Item) => void` | Add to end |
| `prepend` | `(value: Item) => void` | Add to start |
| `insert` | `(index: number, value: Item) => void` | Insert at index |
| `remove` | `(indices: number \| number[]) => void` | Remove one row or several in a single write — order-insensitive, duplicates and out-of-range indices ignored |
| `swap` | `(from: number, to: number) => void` | Swap two items |
| `move` | `(from: number, to: number) => void` | Move item |
| `replace` | `(values: Item[]) => void` | Replace the whole list — every row id is regenerated (length may change) |
| `update` | `(index: number, value: Item) => void` | Overwrite one value, keeping that row's id — no key churn |

Out-of-range indices on `insert`/`remove`/`swap`/`move`/`update` are silent no-ops — values, row ids and the render count all stay untouched.

## Headless movers

The same eight operations exist without React as plain form functions — `useFieldArray`'s movers are thin wrappers around them that add only row-id bookkeeping:

```ts
import {appendValue, removeValue, moveValue} from 'react-f0rm'; // also from 'react-f0rm/server'

appendValue(form, 'todos', {name: 'x'});   // appends, emits 'change' at the array path
removeValue(form, 'todos', [3, 1]);        // returns the dropped indices, descending: [3, 1]
moveValue(form, 'todos', 0, 2);            // returns false on out-of-range / no-op moves
```

Every operation is one whole-array write at the array's own path, so descendant keys never go stale. `*ByPath` variants (`removeValueByPath(form, path, …)`) take a parsed `Path`.

## `replace` vs `update`

`replace(values)` is the refetch shape — a server response replaces the entire list, ids included:

```tsx
const {replace, update} = useFieldArray({name: 'todos'});
replace(await fetchTodos()); // full swap
update(1, {name: 'Buy milk', done: true}); // rewrite one row in place
```

## Subscription Scope

The hook subscribes with a path-prefix filter: only `change` events touching this array's branch — the array key itself or any descendant key — recompute `fields` and re-render the component. Typing into unrelated fields never re-renders the list.
