---
sidebar_position: 8
---

# Sub-forms

Compose several independent forms into one parent — multi-section
checkouts, wizard steps, address books. react-f0rm has no dedicated
`mergeForm` API (TanStack Form's counterpart): the building blocks already
exist (`useForm` headless instances, `subscribe`, `setValue`), and the
patterns below are the supported recipes.

Before reaching for them, check the cheaper option: **a sub-form that
shares the parent's form needs no composition at all** — a plain component
using `useField`/`Field` bound to the parent already isolates renders per
field. Composition only pays off when a section must be a self-contained
form: its own validation, its own reset semantics, or reuse across
unrelated parents.

## Recipe A — owned slices, parent owns submit

Each section is an independent `useForm`. It pushes its values into the
parent's branch on every change, so the parent's `getValues()`/submit
always see the freshest state:

```jsx
import {useForm, subscribe, getValues, setValue, Field} from 'react-f0rm';

function AddressSection({form: parent}) {
  const address = useForm({
    initialValues: {street: '', city: '', zip: ''}
  });

  // Push the whole section into the parent under the 'address' branch.
  // setValue replaces the branch wholesale, so parent and child can never
  // drift apart. subscribe renders nothing — the write rides the event
  // core, and the parent's 'address' subscribers wake exactly once.
  React.useEffect(
    () =>
      subscribe(address, {
        callback: () => setValue(parent, 'address', getValues(address))
      }),
    [address, parent]
  );

  return (
    <fieldset>
      <Field form={address} name="street" />
      <Field form={address} name="city" />
      <Field form={address} name="zip" />
    </fieldset>
  );
}
```

The parent form stays a plain form — `handleSubmit`/`<Form>` on it
validate and submit the composed tree:

```jsx
function Checkout() {
  const form = useForm({initialValues: {}});
  return (
    <Form form={form} onValidSubmit={values => api.checkout(values)}>
      <AddressSection form={form} />
      <button type="submit">Checkout</button>
    </Form>
  );
}
```

Notes:

- `subscribe` fires on **every change event** of the child; each push is a
  wholesale branch write (`setValue` drops superseded descendant keys), so
  the parent branch is a single live entry, never a pile of leaves.
- The child's own validators keep running on the child (its mode, its
  debounce). To gate the parent submit on child validation too, see
  Recipe B.
- `getValues(child)` returns a read-only snapshot — pass it straight into
  `setValue`; never mutate it.

## Recipe B — child validates, parent submits

When the section must fail the parent's submit with its own errors, run
the child's validation at submit time and mirror the failures into the
parent's error state (so `shouldFocusError` and the error hooks see
them). The parent's `onValidSubmit` fires on every attempt — parent
validation passing is just one gate; the child round is the second:

```jsx
import {useForm, subscribe, getValues, setValue, setError, getErrors, trigger} from 'react-f0rm';

function Checkout() {
  const form = useForm({initialValues: {}});
  const sectionRef = React.useRef(null);

  const submit = async values => {
    const child = sectionRef.current;
    if (!(await trigger(child))) {
      // Mirror the child's failures under the parent's 'address' branch.
      for (const {path, type, message} of getErrors(child)) {
        setError(form, `address.${path}`, {type, message});
      }
      return;
    }
    await api.checkout(values);
  };

  return (
    <Form form={form} onValidSubmit={submit}>
      <AddressSection form={form} handle={sectionRef} />
      <button type="submit">Checkout</button>
    </Form>
  );
}

function AddressSection({form: parent, handle}) {
  const address = useForm({initialValues: {street: '', city: '', zip: ''}});
  handle.current = address; // the parent reads it at submit
  React.useEffect(
    () =>
      subscribe(address, {
        callback: () => setValue(parent, 'address', getValues(address))
      }),
    [address, parent]
  );
  return (
    <fieldset>
      <Field form={address} name="street" />
      <Field form={address} name="city" />
      <Field form={address} name="zip" />
    </fieldset>
  );
}
```

Simpler alternative when the section has no validators of its own: skip
the mirror entirely and declare the section's rules on the **parent** —
`<Field form={parent} name="address.street" rules={…} />` validates inside
the parent's normal round, no composition needed.

## Pitfalls

- **Never write the parent back into the child.** A parent → child write
  closes a loop: child's subscribe fires, pushes to parent, parent's
  bulk reset wakes the child, … The child is the writer, the parent is
  the reader — one direction only.
- **`subscribe` returns an unsubscribe.** Return it from the `useEffect`
  like above; StrictMode's dev setup→cleanup→setup is handled by the
  effect contract, no extra guards needed.
- **Branch writes are wholesale.** `setValue(parent, 'address', …)`
  replaces the entire `address` subtree — sibling sections writing their
  own branches are unaffected, but two sections sharing a branch overwrite
  each other. Give every section its own branch.
- **Child unmount semantics are the child's own.** The child's tombstone
  (`shouldUnregister`) affects the child's store only; the last pushed
  branch stays in the parent until the parent removes it (`removeField`).
- **Don't over-compose.** Sections that only need field isolation are
  plain components — see the intro above.

## Further reading

- [subscribe API](../api/subscribe.md)
- [Validation timing](./validation.md)
- [useForm's `values` option](../api/use-form.md)
