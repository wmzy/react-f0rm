---
sidebar_position: 8
---

# Schema Resolvers

Adapters for popular validation libraries. Tree-shakeable — only imported resolvers are bundled.

## Zod

```tsx
import { zodResolver } from 'react-f0rm/resolvers/zod';
import { z } from 'zod';

const schema = z.string().min(1, 'Required').email('Invalid email');

<Field name="email" validate={zodResolver(schema)} />
```

### Schema introspection (zod v3/v4)

`constraintsFromSchema` and `defaultsFromSchema` read a zod schema — v3 and
v4 shapes, duck-typed best effort — so a form builder derives `rules` and
`initialValues` from the schema instead of writing them a second time:

```tsx
import {
  constraintsFromSchema,
  defaultsFromSchema
} from 'react-f0rm/resolvers/zod';

const schema = z.object({
  name: z.string().min(1).max(20).default(''),
  age: z.number().min(18).max(120).optional(),
  items: z.array(z.object({qty: z.number().min(1).default(1)}))
});

const constraints = constraintsFromSchema(schema);
// {
//   name: {minLength: 1, maxLength: 20},   // .default ⇒ not required
//   age: {min: 18, max: 120},              // .optional ⇒ not required
//   'items.qty': {min: 1}                  // de-indexed array path
// }

defaultsFromSchema(schema);
// {name: '', items: [{qty: 1}]}
```

Feed them straight into the form and its fields:

```tsx
const form = useForm({
  initialValues: defaultsFromSchema(schema),
  validate: standardSchemaFormValidator(schema)
});

<Field name="name" rules={constraints.name} />
// Array rows borrow the de-indexed constraint set:
<Field name="items.0.qty" rules={constraints['items.qty']} />
```

Behavior notes:

- String/array checks become `minLength`/`maxLength`, number checks
  `min`/`max`, regex checks `pattern` (carrying the check's own message
  when the schema declares one).
- `required: true` only on non-optional fields that carry at least one
  check — a bare `z.string()` contributes nothing, so `required` is not
  sprayed over every field of the tree. `.optional()`, `.nullable()` and
  `.default()` all drop `required` while keeping the bounds.
- Array elements map to the de-indexed path (`'items.qty'`): the schema
  describes one row, standing in for every index of the live array. The
  array's own length checks (`z.array(...).min(1)`) land on the array path.
- `defaultsFromSchema` omits keys with no default anywhere below; an array
  without its own default seeds a single row from its element's defaults —
  more rows are the user's to add.
- Both functions are pure, never throw, and silently skip nodes they don't
  recognize (unknown zod versions, custom wrappers). Circular or recursive
  schemas terminate.

## Yup

```tsx
import { yupResolver } from 'react-f0rm/resolvers/yup';
import * as yup from 'yup';

const schema = yup.string().required('Required').email('Invalid email');

<Field name="email" validate={yupResolver(schema)} />
```

## Standard Schema

One adapter for every library implementing the
[Standard Schema](https://standardschema.dev) spec — zod v3.24+/v4, valibot v1,
arktype, and more:

```tsx
import {
  standardSchemaResolver,
  standardSchemaFormValidator
} from 'react-f0rm/resolvers/standard-schema';

// Field-level validation (zod shown; any ~standard schema works)
<Field name="email" validate={standardSchemaResolver(z.string().email())} />
```

### Direct schema support — no adapter needed

The core accepts a Standard Schema object directly where a validator is
expected, wrapping it automatically:

```tsx
import {createForm} from 'react-f0rm';
import {z} from 'zod';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email')
});

// Form level: createForm({validate: schema}) — and TValues infers from
// the schema's output type (the TanStack useForm({validators}) shape).
const form = createForm({initialValues: {name: '', email: ''}, validate: schema});

// Field level: useField/Field validate: schema (issues land per-field;
// field-level schemas validate only — they never rewrite the value).
<Field name="email" validate={z.string().email()} />
```

Field-level schemas are validation-only: the store keeps the raw value.
Form-level schemas land their parsed output as the parsed baseline
(coercions included) — same semantics as
[`standardSchemaFormValidator`](#form-level-validation).

### `InferSchemaValues<S>`

Resolves the values type a schema produces — `Output` of its
`~standard.types`, structurally, without importing the schema library:

```tsx
import type {InferSchemaValues} from 'react-f0rm'; // or 'react-f0rm/resolvers/standard-schema'
import {z} from 'zod';

const schema = z.object({age: z.coerce.number()});
type Values = InferSchemaValues<typeof schema>; // {age: number} — coerced side

const form = createForm<Values>({validate: schema});
// setValue(form, 'age', 42)     ✓
// setValue(form, 'agr', 42)     ✗ typo fails at compile time
```

A schema without `types` infers `never` — pass an explicit `TValues`
then. Schemas passed straight to `validate` infer the generic anyway, so
`InferSchemaValues` is for separate declarations and shared type exports.

### Form-level validation

`standardSchemaFormValidator` drives whole-form validation from a single
object schema — issue paths are mapped onto field names automatically:

```tsx
import {createForm} from 'react-f0rm';

const form = createForm({
  initialValues: {name: '', email: ''},
  validate: standardSchemaFormValidator(
    z.object({
      name: z.string().min(1, 'Required'),
      email: z.string().email('Invalid email')
    })
  )
});
```

Issues without a path (form-level errors) are set on the `_form` key.

### Return value: `ValidationOutcome`

`standardSchemaFormValidator` returns a structured `ValidationOutcome` with `errors` **and** `values` sides — not a plain error record:

- On failure, `errors` uses the nested shape the form-level flattening resolves per field, keeping **every** issue of a path (not just the first).
- On success, `values` carries the schema's parsed output — coercions and transforms included — which the form stores as its parsed baseline: `getValues()` and the submit callbacks read the parsed values from then on, live edits keep winning over the baseline, and dirty state keeps comparing live edits against `initialValues` (parsing is not an edit). `reset()` / `setInitialValues()` clear the baseline.

See [Parsed Values](../guides/validation.md#parsed-values) for the full semantics.
