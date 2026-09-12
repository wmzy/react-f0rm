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

## Focusing a New Row

`append`, `prepend` and `insert` take an optional second argument with a `focus` option: `true` focuses the new row's first mounted child field, a string names the child field to focus:

```tsx
append({name: '', qty: 1});                      // no focus — the default
append({name: '', qty: 1}, {focus: true});       // the row's first field
prepend({name: '', qty: 1}, {focus: 'name'});    // that exact child field
```

Unlike react-hook-form — whose array movers focus the new row by default — nothing is focused unless you ask: a toolbar "Add row" button should not yank the caret out of the field the user is typing in.

The target resolves **after the row commits**. The mover's write lands before React renders the new row, so the focus request is scheduled one task later and resolved against the mounted tree: `focus: true` picks the row's first mounted child (registration order); `focus: 'name'` targets the `name` child of that row. A child that never mounts (or `focus: true` on a row with no mounted fields) is a silent no-op, as are guarded no-ops — an out-of-range `insert` never focuses.

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

## Large Arrays & Virtualization

`useFieldArray` re-renders the component holding the array whenever any row or the array itself changes — correct for dozens of rows, wasteful for thousands. Two levers scale it up:

1. **Keep the list component cheap.** The subscription is branch-scoped, so the re-render cost is your list's render cost, not the library's. Memoize row components (rows only re-render when their own props change).
2. **Virtualize the window.** Only mounted rows exist in the DOM; `fields` still describes the whole array, but the window component maps only the visible slice:

```tsx
import {useVirtualizer} from '@tanstack/react-virtual';

function BigList() {
  const {fields, append} = useFieldArray({name: 'rows'});
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: fields.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32
  });

  return (
    <div ref={parentRef} style={{height: 480, overflowY: 'auto'}}>
      <div style={{height: virtualizer.getTotalSize(), position: 'relative'}}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const index = virtualRow.index;
          const field = fields[index];
          return (
            <div
              key={field.id}
              style={{position: 'absolute', top: 0, transform: `translateY(${virtualRow.start}px)`}}
            >
              {/* shouldUnregister: false — scrolled-out rows must keep
                  their values, not tombstone on unmount. */}
              <Field name={['rows', index, 'name']} shouldUnregister={false} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

The row `id` (not the index) is the React key and the `useFieldArrayItem` lookup — both stay valid across reorders and removals, while a freshly appended row mounts once at its real position.

### What re-renders on each operation

- **Editing one row** — the array holder re-renders; memoized rows only when their slice changed. For per-row granularity without the holder, pair virtualization with `useFieldArrayItem({name, id})` per mounted row: a single-row edit re-renders exactly that row.
- **`append`/`prepend`** — one new row mounts; existing rows keep their state (stable ids).
- **`remove`/`swap`/`move`** — index migration re-renders the affected rows by design (their values moved); rows outside the touched indices are untouched.
- **`replace(values)`** — every id regenerates: all mounted rows remount. This is the refetch shape — use it only when the server result truly replaces the list.

Two known tradeoffs at scale:

- **Unmount semantics matter.** Virtualization unmounts rows constantly, and this library's default unmount behavior is a tombstone — a scrolled-out row drops out of `getValues()` unless it is told to stay. Virtualized row fields therefore need `shouldUnregister: false` (per field, or `createForm({shouldUnregister: false})` for the whole form), so off-screen rows keep their committed values.
- **Only mounted validators run.** Per-row field validators only exist while the row is mounted; off-screen rows validate through the array's `rules` and the form-level validator (schema), which read the whole values tree. For virtualized lists, keep the schema or array `rules` as the validation source of truth.
- **Row ids, not indices.** `useFieldArrayItem` looks a row up synchronously at render from the array layer — always pass the same `id` prop `fields` carries, never index-derived keys.
