---
sidebar_position: 9
---

# Derived Fields

A derived field is a field whose value the app computes from other
fields — a slug following the title, shipping mirroring billing, a total
summing line items. react-f0rm has no dedicated `derive` API, and that is
deliberate: the primitives already compose into it (`subscribe` +
`setValue` headlessly, `useValue`/`useStore` + an effect in a component),
the same Subscribe-plus-setValue shape every competitor library uses for
the feature. This guide is the supported recipes.

The one rule that makes a derivation feel native instead of bolted on:
**a derived write is a programmatic write, not a user edit.** It goes
through `setValue` (no validator kicks, no touch, and — with
`shouldDirty: false` — no dirty flag), so dirtiness keeps meaning "the
user typed here" and validation keeps running for the fields the user
actually edits.

## Recipe A — derive until edited (slug ← title)

The slug follows every title keystroke until the user edits the slug by
hand; from then on it is theirs. The pivot is the field's dirty flag:
`getFieldState(form, 'slug').isDirty` (the name-based read of what
`isFieldDirtyByPath` computes per path) is true exactly once the user
has typed into the slug.

### Headless — `subscribe` + `setValue`

```jsx
import {useForm, subscribe, getValue, setValue, getFieldState} from 'react-f0rm';

const slugify = s =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function useSlug(form) {
  React.useEffect(
    () =>
      subscribe(form, {
        name: 'title',
        callback: () => {
          // Dirty means the user typed here — hands off.
          if (getFieldState(form, 'slug').isDirty) return;
          setValue(form, 'slug', slugify(getValue(form, 'title')), {
            shouldDirty: false
          });
        }
      }),
    [form]
  );
}
```

`{shouldDirty: false}` is load-bearing: it lands the write as a commit
(the field's new dirty-comparison baseline), so the derived write itself
never marks the slug dirty. Without it the first derived write would
flip `isDirty` on and the derivation would stop following after one
keystroke — dirty stays reserved for user edits, checkable afterwards
with `getDirtyFields(form)`.

Re-render impact: none for the derivation logic — `subscribe` renders
nothing, the callback rides the event core. The `setValue` emit on
`'slug'` wakes exactly the slug's leaf-scoped subscribers, so the only
React work is the slug field re-rendering its own new value (the title
input re-renders from the user's keystroke, not from the derivation).

### Hook — `useValue` + `useIsFieldDirty`

When the derivation belongs to the component tree anyway, read the
sources through the field-scoped hooks and commit in an effect:

```jsx
import {Field, useValue, useIsFieldDirty, setValue} from 'react-f0rm';

function SlugField({form}) {
  const title = useValue(form, 'title');
  const locked = useIsFieldDirty(form, 'slug');

  React.useEffect(() => {
    if (locked) return;
    setValue(form, 'slug', slugify(title), {shouldDirty: false});
  }, [form, title, locked]);

  return <Field form={form} name="slug" />;
}
```

Two leaf-scoped subscriptions: `useValue(form, 'title')` re-renders this
component only on title writes (slug writes never wake it), and
`useIsFieldDirty` only when the slug's dirty verdict flips. The cost
profile is one extra component re-render per title keystroke versus the
headless version — keep the deriving component small, or drop to the
headless recipe when even that is too much.

`useStore` is the single-subscription variant when the projection is
yours and spans state events — a derived candidate computed in the
selector, committed in the effect:

```jsx
const candidate = useStore(form, () => slugify(getValue(form, 'title')));
```

The selector returns a primitive here, so `useStore`'s identity check
bails out on unrelated events for free; a selector returning a fresh
object per call needs an `isEqual` comparator (see the
[Hooks Reference](./hooks-reference.md)).

## Recipe B — copy toggle (shipping follows billing)

While the checkbox is on, shipping continuously mirrors billing; once
off, the two are independent and shipping keeps whatever it had. Two
scoped subscriptions with the same guard:

```jsx
import {
  useForm, Form, Field, Checkbox,
  subscribe, getValue, getValues, setValue
} from 'react-f0rm';

function AddressForm() {
  const form = useForm({
    initialValues: {
      sameAs: false,
      billing: {street: '', city: '', zip: ''},
      shipping: {street: '', city: '', zip: ''}
    }
  });

  React.useEffect(() => {
    const copy = () =>
      setValue(form, 'shipping', getValues(form).billing, {
        shouldDirty: false
      });
    const following = () => getValue(form, 'sameAs');
    const unsubscribes = [
      // Toggling on copies the current billing immediately...
      subscribe(form, {
        name: 'sameAs',
        callback: () => {
          if (following()) copy();
        }
      }),
      // ...and while on, every billing write mirrors (branch scope:
      // 'billing' hears billing.street, billing.city, ... writes).
      subscribe(form, {
        name: 'billing',
        callback: () => {
          if (following()) copy();
        }
      })
    ];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [form]);

  return (
    <Form form={form}>
      <label>
        <Checkbox form={form} name="sameAs" /> Ship to billing address
      </label>
      <fieldset>
        <legend>Billing</legend>
        <Field form={form} name="billing.street" />
        <Field form={form} name="billing.city" />
        <Field form={form} name="billing.zip" />
      </fieldset>
      <fieldset>
        <legend>Shipping</legend>
        <Field form={form} name="shipping.street" />
        <Field form={form} name="shipping.city" />
        <Field form={form} name="shipping.zip" />
      </fieldset>
    </Form>
  );
}
```

### Why `setValue`, not `changeValue` / `userChangeByPath`

The mirror is a consequence, not an edit — the user typed into billing,
and billing's validators already ran. Writing through the user-change
channel would double the work and blur the state:

- `changeValue(form, name, value)` (the name-based twin of the path-level
  `userChangeByPath`) rides the gated user-change pipeline: the shipping
  validators kick under `mode`/`reValidateMode` (with `mode: 'onChange'`
  that is a re-validation per mirrored keystroke), `validateDeps` and
  `validateMode` form-level rounds re-run per mirror, and the write reads
  as the user having edited shipping.
- `setValue` does none of that by default: no validator, no touch, and —
  with `shouldDirty: false` — shipping reads clean while following, so
  `isDirty`/`getDirtyFields` report only real user divergence.

When a derived write *should* validate (a derived field with rules of
its own), opt in per write:
`setValue(form, name, value, {shouldValidate: true})` kicks the field's
registered validator unconditionally — or use `changeValue` when the full
mode-gated user semantics are what you mean.

Notes:

- The branch copy must read through `getValues(form).billing` — `getValue`
  resolves a stored key or an ancestor's wholesale write, so leaf edits
  (`billing.street` typed into, never written as a whole branch) are
  invisible to `getValue(form, 'billing')`. `getValues` returns the
  merged tree.
- `setValue` at `'shipping'` is a wholesale branch write: superseded
  descendant keys are dropped, so a billing key removed while following
  disappears from shipping too — the branches cannot drift.
- After unchecking, shipping keeps the last mirrored values; the next
  billing edit hits the `following()` guard and changes nothing.

Re-render impact: per billing keystroke while following — the billing
field re-renders from its own edit, the mirror write emits `'change'` on
the shipping branch and each shipping field's leaf subscription wakes
(ancestor writes invalidate leaf reads), exactly once. No component
holding form-wide state re-renders; while unchecked, the guard returns
before any write and the billing subscription costs one callback run.

## Derived fields vs `useTransform`

They solve adjacent problems and are not interchangeable:

- **`useTransform` is one field, two representations.** The control
  displays something other than the stored raw value (`toDisplay`
  store→display, `fromDisplay` on write); the store always carries the
  raw value. Same path in both directions, and commits ride the
  user-change pipeline — mode-gated validation fires as if the user
  typed, because they did.
- **A derived field is a different field computed from others.** Cross-
  path, one-directional, written programmatically (`setValue`, typically
  `shouldDirty: false`), validated only when you opt in.

Rule of thumb: same field, different representation → `useTransform`;
different field, computed from other fields → a derivation. They stack —
a price stored in cents behind a decimal input, and a total derived from
it:

```jsx
import {useTransform, subscribe, getValue, setValue} from 'react-f0rm';

function PriceInput({form}) {
  // Same field, two representations — useTransform.
  const price = useTransform(form, 'price', {
    toDisplay: cents => (cents / 100).toFixed(2),
    fromDisplay: display => Math.round(Number(display || 0) * 100)
  });
  return (
    <input value={price.value} onChange={e => price.onChange(e.target.value)} />
  );
}

// A different field, computed from others — a derivation.
// A name array fans out to one subscription per path.
subscribe(form, {
  name: ['price', 'qty'],
  callback: () =>
    setValue(form, 'total', getValue(form, 'price') * getValue(form, 'qty'), {
      shouldDirty: false
    })
});
```

The two never fight: `useTransform` never leaves its own path, so the
derivation's `['price']` subscription simply sees the transformed raw
value land and recomputes the total.

## Pitfalls

- **Don't write inside your own watched scope.** Emissions are
  synchronous, so a derivation whose write lands inside its subscription
  path re-fires itself — deriving `shipping.zip` from `shipping.street`
  under a `name: 'shipping'` branch subscription loops forever. Derive
  across disjoint paths (Recipe A/B), subscribe at leaf scope, or
  compare and skip when the value already matches.
- **`{shouldDirty: false}` is what keeps the pivot honest.** Recipe A's
  dirty check only means "the user typed" because every derived write
  commits as a baseline. Mixing plain `setValue` writes into a derived
  field locks the derivation after the first write.
- **`reset` resumes following.** `reset` clears live values and dirty
  baselines, so the slug's dirty flag drops and the next title edit
  derives again — usually exactly the wanted semantics.
- **`subscribe` returns an unsubscribe.** Return it from the `useEffect`
  as above; StrictMode's dev setup→cleanup→setup is handled by the
  effect contract.

## Further reading

- [subscribe API](../api/subscribe.md)
- [useTransform in the Hooks Reference](./hooks-reference.md)
- [Sub-forms](./sub-forms.md) — the sibling composition recipes
- [Validation timing](./validation.md) — the mode matrix user-change writes ride
