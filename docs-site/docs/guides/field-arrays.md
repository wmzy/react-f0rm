---
sidebar_position: 3
---

# Field Arrays

Use `useFieldArray` to manage dynamic lists of fields.

```tsx
import {useFieldArray, Field} from 'react-f0rm';

function Items() {
  const {fields, append, remove, swap} = useFieldArray({name: 'items'});

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
      <button type='button' onClick={() => append({name: '', qty: 1})}>
        Add Item
      </button>
    </>
  );
}
```

## Re-render Scope

`useFieldArray` subscribes with a path-prefix filter: only changes touching the array's branch — the array key itself or any descendant key — recompute `fields` and re-render the component. Typing into unrelated fields elsewhere in the form never re-renders the list.

## Movers

`append`, `prepend`, `insert`, `remove`, `swap`, `move` map 1:1 to react-hook-form's `useFieldArray`. `remove` takes one index **or a list** — several rows drop in a single write, order-insensitive, duplicates ignored:

```tsx
remove([3, 1]); // rows 1 and 3 drop in one write; row ids stay aligned with values
```

Out-of-range `insert`/`remove`/`swap`/`move` calls are silent no-ops — values, row ids and render count all untouched. `useFieldArray<Item>({name})` types every mover's value argument against the array's element type:

```tsx
const {append, update} = useFieldArray<{qty: number}>({name: 'items'});
append({qty: 1});  // typed — append('nope') is a compile error
```

## `replace` and `update`

Two bulk operations complement the movers:

```tsx
const {replace, update} = useFieldArray({name: 'todos'});

replace(await fetchTodos());            // full swap — every row id is regenerated
update(1, {name: 'Buy milk', done: true}); // rewrite one row, keeping its id
```

`replace(values)` is the refetch shape — a server response replaces the whole list, length may change, every id regenerates (rows remount) — while `update(index, value)` overwrites a single value in place without churning React keys.

## Options

```tsx
const {fields, append} = useFieldArray({
  name: 'tags',
  keyName: 'key',                   // stable row id exposed as field.key (default 'id')
  rules: {required: true, minLength: 1, maxLength: 5}, // validated against the whole array
  shouldUnregister: false           // keep the branch on unmount (default: form-level flag)
});

fields.map(field => <div key={field.key}>…</div>);
```

- `keyName` — the property name each `fields` entry carries its stable row id under; a custom name avoids clashing with a row data field.
- `rules` — `FieldRules` validated against the array itself: `required` fails on `[]`, `minLength`/`maxLength` read the length. Checked on submit and `trigger`, like every registered validator.
- `shouldUnregister` — unmounting the array follows the same effective rule as a bound field: tombstone by default (the branch drops out of `getValues()`), keep the values when the option or `createForm({shouldUnregister: false})` says so.

## Headless Movers

The same operations exist without React: `appendValue`/`prependValue`/`insertValue`/`removeValue`/`moveValue`/`swapValues`/`replaceValues`/`updateValue` (each with a `*ByPath` variant; `react-f0rm/server` re-exports them too) — `useFieldArray`'s operations are thin wrappers around them that add row-id bookkeeping. `removeValue` takes one index or a list and returns the dropped indices descending; guarded movers report `false`/`[]` instead of writing.

## Per-row Subscriptions

For large arrays, `useFieldArrayItem({name, id})` scopes the subscription to a single row so editing row K re-renders only row K — see [Hooks Reference](./hooks-reference.md#usefieldarrayitem--one-row-one-subscription).
