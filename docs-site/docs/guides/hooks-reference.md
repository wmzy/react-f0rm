---
sidebar_position: 12
---

# Hooks Reference

The hooks that do not bind to a DOM element — watching state, projecting slices, transforming display values, and per-row array subscriptions.

## `useWatch` — a single event, a getter, an optional comparator

`useWatch(form, event, getter, isEqual?)` subscribes to one event and keeps the component's snapshot of `getter()` in sync. Built on React's native `useSyncExternalStore` (tearing-safe), so the server snapshot and the client's first render agree.

```tsx
import {useWatch} from 'react-f0rm';

// Reference-stable reads: Object.is bails the re-render when the getter
// returns the same reference (the contract every named hook relies on).
const errors = useWatch(form, 'errors', getErrors.bind(null, form));
```

The optional fourth argument is for **wide-scope getters that build a fresh reference per call** (a whole-values selector, a derived aggregate). On each event the getter recomputes, `isEqual(prev, next)` decides, and an equal verdict skips notifying React altogether — no render, not even a bailed-out one (TanStack `useSelector`'s compare contract):

```tsx
const summary = useWatch(
  form,
  'change',
  () => ({first: getValue(form, 'first'), last: getValue(form, 'last')}),
  (prev, next) => prev.first === next.first && prev.last === next.last
);
```

The framework-free counterpart is `watch(form, event, getter, isEqual?)` — the same contract as a plain subscribe/getSnapshot handle for non-React bindings and imperative code. `subscribe` is the imperative-only sibling (runs callbacks, renders nothing): use `subscribe` for linkages, a hook when the value must appear on screen.

## `useValues` — the whole tree, one subscription

`useValues(form)` watches the entire values tree — any 'change' event re-renders the calling component with the memoized `getValues(form)` snapshot. React-hook-form's `watch()` with no arguments. Broad scope by design: fine for cheap summary components, but per-field readers should use [`useValue`](#usevalue) so a keystroke re-renders exactly the affected field.

```tsx
import {useValues} from 'react-f0rm';

function Summary({form}) {
  const values = useValues(form); // full tree, reference-stable between writes
  return <pre>{JSON.stringify(values, null, 2)}</pre>;
}
```

## `useStore` — the selector primitive

`useStore(form, selector, isEqual?)` subscribes to **every** state-bearing event and keeps `selector()`'s result as the snapshot — TanStack Form's `useStore(store, selector)` counterpart. The selector is a plain closure; read the form through any getter inside it.

```tsx
import {useStore} from 'react-f0rm';

// One flag spanning two state channels, with a comparator so the
// component re-renders only when the boolean actually flips.
const busy = useStore(
  form,
  () => form.validating.size > 0 || form.isSubmitting,
  // The projection is a boolean — Object.is alone suffices. Omit isEqual
  // for reference-stable projections, pass it for fresh-reference ones
  // (the useWatch contract above).
);

// A derived object projection: fresh reference per call, comparator keeps
// renders to actual changes.
const totals = useStore(
  form,
  () => ({count: getValues(form).items.length}),
  (prev, next) => prev.count === next.count
);
```

`useFormState(form)` is the built-in aggregate selector (one subscription, a field-wise comparator); `useWatch` is the single-event version. Reach for `useStore` when the projection is yours and spans events.

## `useErrors` / `useFormState().errors` — typed, memoized

Both expose every error as one record keyed by the user-facing dotted path (`'a.b'`, `'list.0'`) — react-hook-form's `formState.errors` shape. The record is typed: `FieldErrors<T>` resolves each key from `FieldPath<T>` (per-key values are `FieldError[] | undefined`, and the `FORM_ERROR` slot for form-level errors is included). Memoized per form, so the hook re-renders only when an error write actually changed content.

```tsx
import {useErrors} from 'react-f0rm';

function ErrorSummary({form}: {form: Form<Profile>}) {
  const errors = useErrors(form); // FieldErrors<Profile>
  // errors.email: FieldError[] | undefined — compile-time key checks
  return errors.email?.[0]?.message ?? null;
}
```

Keys follow the runtime form: array paths are dot-joined (`'tags.0'`, not `'tags[0]'` — bracket spelling is a path form, the record joins segments with dots). Two exported helpers bridge the spellings: `fieldPathToDottedKey('tags[0].name')` → `'tags.0.name'` (the record key to read), `dottedKeyToFieldPath('tags.0.name')` → `'tags[0].name'` (the form every field API takes); the `DottedPath<P>` type names the key style at compile time.

## `useTransform` — display ≠ stored value

Bind a control whose display value differs from the raw stored value: number inputs, date pickers, selects that store objects. The store always carries the raw typed value; `toDisplay` maps it to what the control renders, `fromDisplay` maps back on write. Either direction is optional (identity).

```tsx
import {useTransform} from 'react-f0rm';

function AgeField({form}: {form: Form<{age: number}>}) {
  const age = useTransform(form, 'age', {
    toDisplay: raw => String(raw),
    fromDisplay: display => Number(display)
  });
  return <input value={age.value} onChange={e => age.onChange(e.target.value)} />;
}
```

`value` subscribes to `'change'` at leaf scope like a controlled `useField` value; `onChange` writes through the user-change channel, so with a field mounted at the same path the mode/reValidateMode-gated validation fires exactly as if the user typed (validators receive the raw value). `fromDisplay` may return a Promise; `asyncDebounceMs` debounces the display→raw commit — latest write wins, stale resolutions dropped (TanStack `asyncDebounceMs` parity).

## `useFieldArrayItem` — one row, one subscription

`useFieldArray` subscribes to the whole branch: any row's edit re-renders the component holding the array. `useFieldArrayItem({name, id})` scopes the subscription to a single row, identified by the stable `id` from `fields[i].id`:

```tsx
import {useFieldArray, useFieldArrayItem} from 'react-f0rm';

const Row = React.memo(function Row({id}: {id: number}) {
  const item = useFieldArrayItem({name: 'tags', id});
  return (
    <input
      value={item.value ?? ''}
      onChange={e => item.setValue(e.target.value)}
    />
  );
});

function Tags({form}: {form: Form<{tags: string[]}>}) {
  const {fields, append, remove} = useFieldArray({name: 'tags', form});
  return (
    <div>
      {fields.map(field => (
        <div key={field.id}>
          <Row id={field.id} />
          <button type='button' onClick={() => remove(field.index)}>Remove</button>
        </div>
      ))}
      <button type='button' onClick={() => append('')}>Add</button>
    </div>
  );
}
```

Editing row K re-renders only row K. Two requirements: a paired `useFieldArray({name})` mounted at the same path (it publishes the id table), and a `React.memo` row with stable props — everything else comes from the hook. Rows whose index migrates (reorder/remove) re-render by design; `replace` regenerates every id and remounts every row. The hook returns `{value, setValue, errors, error, name, index, form}` — reads and writes live on the array layer, the same layer every `useFieldArray` operation touches. Without a paired `useFieldArray` the row is inert rather than broken (`index: -1`, `value: undefined`, `setValue` a no-op).

## `createFormContext` — typed, isolated contexts

For multiple forms per subtree or reusable field components, `createFormContext<Values>()` builds a private context plus pre-bound `useField`/`useFieldArray`/`useFieldArrayItem`/`useFormContext` — see the [createFormContext API](../api/create-form-context.md).
