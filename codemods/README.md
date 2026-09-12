# react-f0rm codemods

[jscodeshift](https://github.com/facebook/jscodeshift) transforms that
mechanically migrate [React Hook Form](https://react-hook-form.com) (RHF)
call sites to react-f0rm. v1 covers the two shapes that are safely rewritable
by syntax alone; everything that crosses a function boundary stays manual
([checklist](#manual-steps-not-covered-in-v1)).

The transforms are dev tooling only — `src/` never imports anything from this
directory, so the published package is unaffected.

## Usage

`jscodeshift` is a devDependency of this repo, so from the repo root:

```sh
# dry run — prints the diff, writes nothing
pnpm exec jscodeshift -t codemods/transforms/use-form-options.js -d src/

# apply (commit first; jscodeshift rewrites files in place)
pnpm exec jscodeshift -t codemods/transforms/use-form-options.js src/
pnpm exec jscodeshift -t codemods/transforms/register-binding.js src/
```

`npx jscodeshift -t codemods/transforms/<name>.js <files>` works the same way
outside the repo. Both transforms set `parser: 'tsx'`, so one transform covers
`.js` / `.jsx` / `.ts` / `.tsx` files.

Run Prettier afterwards: recast reprints every object it structurally edited
one property per line (deterministic, but not house style).

Recommended order: switch the `react-hook-form` import to `react-f0rm` first,
run both transforms, then work through the manual checklist below.

## rename-use-form-options — `useForm()` options

Rewrites the object literal passed to `useForm(...)`:

| RHF option | Action |
|---|---|
| `defaultValues` | renamed to `initialValues` (shorthand `{defaultValues}` expands to `initialValues: defaultValues`) |
| `criteriaMode` | removed, reported via `console.info` — react-f0rm keeps every failure per field natively (each is its own `FieldError`) |
| `progressive` | removed, reported — no counterpart |
| `resolver` | removed, reported — react-f0rm takes the schema itself via `validate` (see the [manual steps](#manual-steps-not-covered-in-v1)) |
| `mode`, `reValidateMode`, `shouldUnregister` | kept — same names, same meaning |
| `values`, `disabled`, `delayError` | kept — `delayError` moves to `useField`'s `delayError` option by hand |

Skipped conservatively: `useForm()` without options, non-literal option
objects, and calls whose object already has an `initialValues` key (so
re-running the transform is always a no-op). `useForm` imported under an alias
is not recognized.

## wrap-register-rules — `register()` rule options

react-f0rm's `register` takes the same second-argument object, but the
declarative rules live one level deeper:

```js
register('age', {required: true, min: 18, valueAsNumber: true});
// →
register('age', {rules: {required: true, min: 18}, valueAsNumber: true});
```

Both callee shapes are matched: the destructured `register(...)` binding and
the instance method `form.register(...)` (including computed `form['register']`).

| RHF `register` option | Lands in |
|---|---|
| `required`, `min`, `max`, `minLength`, `maxLength`, `pattern`, `validate` | `rules: {…}` (the react-f0rm `FieldRules` keys), order preserved |
| `valueAsNumber`, `valueAsDate` | top level — already react-f0rm `RegisterOptions` keys; wrapping them would silently disable the coercion |
| `onChange`, `onBlur`, `disabled`, `setValueAs`, `value`, `deps`, `shouldUnregister` | top level, untouched |

Skipped conservatively: no second argument, a non-literal second argument, an
empty options object, an existing `rules` key (idempotent), and any spread
element in the options object (reported via `console.info`).

## Manual steps (not covered in v1)

- **`useForm()` destructuring** — react-f0rm's `useForm` returns the form
  instance itself: `const {register, handleSubmit, formState} = useForm()`
  does not compile. Rewrite to `const form = useForm()` and update every
  member (`register(...)` → `form.register(...)`, …). The transforms stop at
  call boundaries on purpose.
- **`watch('x')`** → `useValue(form, 'x')`; `watch()` →
  `useWatch(form, 'change', () => getValues(form))` — a hook now, so the call
  must move into the component body.
- **`Controller` / `useController`** → `useField({name})` (or `<Field>`).
- **`handleSubmit(onValid, onInvalid)`** → `onValidSubmit` / `onInvalidSubmit`
  props on `<Form>`, or headless `handleSubmit(form, {onValidSubmit})`.
- **`formState.*` reads** → `useFormState(form)` or the granular hooks
  (`useIsDirty`, `useIsSubmitting`, `useError`, …).
- **`resolver`** → `validate: standardSchemaFormValidator(schema)`, imported
  from `react-f0rm/resolvers/standard-schema`.
- **`setValueAs: fn`** → `eventToValue` — note it receives the *event*, not
  the value.
- **`deps`** → `validateDeps` (per field, or form-level on `createForm`).
- **Unmount semantics are inverted** — RHF keeps unmounted values by default;
  react-f0rm tombstones them. Pass `shouldUnregister: false` (per binding or
  on `createForm`) wherever you relied on the keep behavior.

The full mapping guide lives at
`docs-site/docs/migration/from-react-hook-form.md`.
