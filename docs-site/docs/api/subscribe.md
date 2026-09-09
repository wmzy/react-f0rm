---
sidebar_position: 7
---

# subscribe

Subscribe to form events imperatively — the non-render counterpart of the `use*` hooks. Linked fields and other non-render side effects — province changed → clear city, autosave, analytics — run without mounting a watching component:

```tsx
import {createForm, subscribe, getValue, setValue} from 'react-f0rm';

const form = createForm({initialValues: {province: '', city: ''}});

const unsubscribe = subscribe(form, {
  name: 'province',
  callback: () => {
    // Read fresh state through the getters inside the callback.
    if (getValue(form, 'city')) setValue(form, 'city', '');
  }
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | field path, or an array of them | omitted — every emission of `event` fires `callback`, payload-less broadcasts (reset, `setInitialValues`, …) included | Path (or list of paths) to watch |
| `event` | `'change' \| 'errors' \| 'touched' \| 'submitting' \| 'submitCount'` | `'change'` | The event to watch |
| `scope` | `'leaf' \| 'branch'` | `'branch'` | Which writes around `name` are relevant — only meaningful for `'change'` |
| `callback` | `() => void` | required | Fired with no arguments after each matching emission; read fresh state through the `get*` readers inside it |

Returns an unsubscribe function. An array of names creates one subscription per path, and the returned function unsubscribes them all.

## Matching

Matching follows the event's shape:

- `'change'` walks the path tree: the default `'branch'` scope wakes a `'tags'` subscriber when any `tags.*` descendant is written, while `'leaf'` matches only the exact key and its ancestors.
- `'errors'` and `'touched'` are stored per exact key, so they always match the exact key — another field's error never wakes this subscriber.
- `'submitting'` / `'submitCount'` are payload-less, so a `name` narrows nothing.

A number-bearing array (`['tags', 0]`) is one segments path, not a name list — the same rule `trigger` uses.

## `subscribe` vs `useWatch`

`useWatch` (and the `useValue` / `useError` / … readers built on it) feeds rendering — it returns a snapshot and re-renders the component when it changes. `subscribe` runs imperative code and renders nothing. Use `subscribe` for linkages and effects; reach for a hook only when the watched value itself must appear on screen.

## `watch`: a snapshot handle for non-React consumers

`watch(form, event, getter, isEqual?)` is the framework-free counterpart of `useWatch` — a named export (tree-shaken when unused) returning a subscribe/getSnapshot pair any reactive runtime can bind to:

```ts
import {createForm, watch, getValue} from 'react-f0rm';

const form = createForm({initialValues: {email: ''}});
const handle = watch(form, 'change', () => getValue(form, 'email'));

// Imperative consumer: read + react.
const unsubscribe = handle.subscribe(() => autosave(handle.getSnapshot()));

// React adapter — useWatch is exactly this composition:
// useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot);

handle.dispose(); // teardown: drops the internal listener and consumers
```

Contract:

- `getSnapshot()` is always fresh — the handle keeps an internal listener from creation, so reads never return a pre-write value, subscribed or not.
- `subscribe(cb)` fires only when the projection observably changed: with an `isEqual` comparator the getter re-runs per event and an equal verdict skips the callback entirely (TanStack's `useSelector` contract); without one, every heard event wakes the listener.
- `getter` and `isEqual` are captured at `watch()` call time — call it at setup, `dispose()` it at teardown.
- Bare `watch` hears every emission of `event` (payload-less broadcasts included). Path scoping on this side is `subscribe({name})`'s job.
