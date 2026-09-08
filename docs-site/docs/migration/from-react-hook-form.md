---
sidebar_position: 2
---

# Migrating from React Hook Form

This guide maps React Hook Form v7 concepts to react-f0rm piece by piece. Every react-f0rm snippet uses the real public API.

## Key Differences

| Feature | React Hook Form | react-f0rm |
|---|---|---|
| Form creation | `useForm({defaultValues, mode, resolver})` returns a `{control, handleSubmit, …}` toolbox | `createForm` (headless factory) or `useForm` (hook) returns the **form instance itself** — every operation is a function taking the form |
| Field binding | `register('name')` — uncontrolled by default, spread onto the input | `<Field name="…">` — controlled with a per-field subscription; `uncontrolled` / `<Field uncontrolled />` for the register model |
| Controlled components | `Controller` / `useController` render prop | `useField({name})` returns `{value, onChange, onBlur, …}`; `<Field>` is its DOM binding |
| Validation | `mode` / `reValidateMode` timings, `rules` on `register` | Same `mode` / `reValidateMode` strings, `rules` on `<Field>`/`useField`, plus a per-field `validate` callback |
| Schema validation | `@hookform/resolvers/*` — one package per library | One Standard Schema resolver (`react-f0rm/resolvers/standard-schema`) for zod/valibot/arktype/…; legacy `zod`/`yup` entries shipped too |
| Errors | `formState.errors.name.message`, `errors.name.types`, `errors.root` | Flat, per-field: `useField`'s `error`/`errors`, `useError(form, name)`; form-level issues live under `FORM_ERROR` |
| Multiple errors per field | `criteriaMode: 'all'` opt-in | Native — every field holds `FieldError[]` |
| Unregister on unmount | Value kept by default (`shouldUnregister: false`) | **Tombstone by default** — pass `createForm({shouldUnregister: false})` for RHF semantics (see [Pitfalls](#pitfalls)) |
| Async validation | Async resolvers/validators; debounce and cancellation hand-rolled | `validateDebounce` per field + `meta.signal` (`AbortSignal`) — superseded rounds cancel their work |
| Watching | `watch(name)` / `useWatch({control, name})` | `useValue(form, name)` / `useWatch(form, 'change', getter)` / `useFormState(form)` |
| Form state | `formState` object on the hook | `useFormState(form)` aggregate + granular hooks (`useIsDirty`, `useIsSubmitting`, …) |
| Submission | `handleSubmit(onValid, onInvalid)(event)` | `<Form onValidSubmit onInvalidSubmit>` or headless `handleSubmit(form, {…})` |
| Server errors | `setError` with `type: 'server'` | `setServerErrors(form, {field: message})` — or `setError(form, name, {type: 'server', message})` |
| Arrays | `useFieldArray({control, name})` + `fields.map((f, i) => …)` | `useFieldArray({name, form?})` — same shape; `useFieldArrayItem` for per-row subscriptions |
| Nested form contexts | `FormProvider` + `useFormContext()` | `FormProvider` + `useFormContext<T>()`, or typed, isolated `createFormContext<T>()` bundles |
| Bundle size | 14.06 KB gzip | 11.14 KB gzip core (emitter-external) + one shared dependency |

## Migration Steps

### 1. Replace `useForm`

```diff
- import { useForm } from 'react-hook-form';
- const { register, handleSubmit, formState, control } = useForm({
-   defaultValues: {email: ''},
-   mode: 'onBlur',
- });
+ import { Form, Field, useForm } from 'react-f0rm';
+ const form = useForm({
+   initialValues: {email: ''},
+   mode: 'onBlur',
+ });
```

The `mode` / `reValidateMode` strings (`'onSubmit'`, `'onBlur'`, `'onChange'`, `'onTouched'`, `'all'` and `'onChange'` / `'onBlur'` / `'onSubmit'`) mean the same thing. **Start with `createForm({shouldUnregister: false})` (or `<Form shouldUnregister={false}>`) if you relied on RHF's keep-the-value unmount behavior** — react-f0rm's default tombstones unmounted fields so they drop out of `getValues()`.

### 2. Replace `register` with `Field`

```diff
- <input {...register('email', {required: 'Email is required'})} />
+ <Field name="email" rules={{required: 'Email is required'}} />
```

The `register` rule subset maps onto the `rules` prop:

| RHF `register` option | react-f0rm |
|---|---|
| `required: 'msg'` | `rules={{required: 'msg'}}` (string or `true`; custom message via `required: '…'`) |
| `min` / `max` (numbers) | `rules={{min, max}}` — message overrides via `messages: {min: '…'}` |
| `minLength` / `maxLength` | `rules={{minLength, maxLength}}` |
| `pattern: {value, message}` | `rules={{pattern: {value, message}}}` |
| `validate: fn` | `validate={fn}` — receives the **typed** value at the field's path (`PathValueOf<Values, P>`) plus `meta` (`signal` included); may be async |
| `valueAsNumber` / `valueAsDate` | `<Field valueAsNumber />` / `<Field valueAsDate />` |
| `setValueAs` / `onChange` | `eventToValue={e => …}` (Field) or the raw `onChange` from `useField` |
| `disabled` | `disabled` — OR-ed with the form-level `createForm({disabled})` / `setDisabled` flag |
| `shouldUnregister` | `shouldUnregister` per field (see [Pitfalls](#pitfalls)) |
| `deps` (re-validate when another field changes) | `validateDeps={['password']}` per field, or form-level `createForm({validateDeps})` |

### 3. Keep the uncontrolled model where you need it

`register` never re-renders while typing. `<Field>` is controlled with a per-field subscription (only that field re-renders), but the exact register model is available:

```diff
- <input {...register('email')} />
+ <Field name="email" uncontrolled />
```

`uncontrolled: true` skips the value subscription — typing re-renders nothing, while errors/touched/disabled/validating stay reactive (which raw `register` does not give you). It benches at `register` parity.

### 4. `Controller` → `useField` (or `<Field>`)

```diff
- <Controller
-   name="email"
-   control={control}
-   rules={{required: true}}
-   render={({field, fieldState}) => (
-     <input {...field} value={field.value} />
-   )}
- />
+ const {value, onChange, onBlur, error} = useField({name: 'email'});
+ <input value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
```

`Controller`'s `defaultValue` is `useField({initialValue})` / `<Field initialValue>`. `fieldState.error` is the `error` string; `fieldState.isDirty`/`isTouched`/`isValidating` live in the `useField` result as `isDirty`, plus `useIsFieldDirty`/`useTouched`/`validating`. Headless and component approaches compose: `<Field>` is `useField` bound to a DOM element.

### 5. Replace `watch` / `useWatch`

```diff
- const email = watch('email');              // value at render + re-render on change
- const all = watch();                       // everything
- const email = getValues('email');          // read once, no subscription
+ const email = useValue(form, 'email');
+ const all = useWatch(form, 'change', () => getValues(form));
+ const email = getValue(form, 'email');     // read once, no subscription
```

`useWatch(form, event, getter, isEqual?)` is the general channel — note the argument order differs from RHF (`{control, name}`). The path-scoped readers (`useValue`, `useError`, `useTouched`, `useIsFieldDirty`) subscribe at leaf scope, so unrelated writes never re-render them.

### 6. Replace `formState`

| RHF `formState` | react-f0rm |
|---|---|
| `formState.isDirty` / `dirtyFields` | `useIsDirty(form)` / `useDirtyFields(form)` — or `useFormState(form).isDirty` / `.dirtyFields` |
| `formState.touchedFields` | `useTouchedFields(form)` |
| `formState.isSubmitting` / `submitCount` | `useIsSubmitting` / `useSubmitCount` |
| `formState.isValid` / `isValidating` | `useIsValid` / `useIsValidating` |
| `formState.isSubmitted` / `isSubmitSuccessful` | `useFormState(form).isSubmitted` / `useIsSubmitSuccessful` |
| `formState.isLoading` | `useIsLoading(form)` (async `initialValues`) |
| `formState.errors.name.message` | `useError(form, 'name')`; nested paths work too — `useError(form, 'items[0].name')` |
| `formState.errors.root` | `useFormError(form)` / `useFormErrors(form)` (the `FORM_ERROR` key) |
| Everything at once | `useFormState(form)` — one subscription, field-wise comparator |

### 7. Replace `handleSubmit`

```diff
- <form onSubmit={handleSubmit(onValid, onInvalid)}>
+ <Form onValidSubmit={onValid} onInvalidSubmit={onInvalid}>
```

Headless equivalent:

```diff
- const onSubmit = handleSubmit(onValid);
+ const onSubmit = handleSubmit(form, {onValidSubmit: onValid});
```

`onValidSubmit(values, e)` receives the values object; `onInvalidSubmit(errors, values)` receives a flat `{path, type, message}[]` list (RHF's `onInvalid` receives `FieldErrors`). `shouldFocusError` is supported (`shouldFocusError` on `<Form>` / the `handleSubmit` options, default `true`).

### 8. Imperative operations

| RHF | react-f0rm |
|---|---|
| `setValue('a', v, {shouldValidate, shouldTouch, shouldDirty})` | `setValue(form, 'a', v, {shouldValidate, shouldTouch, shouldDirty})` — identical option names |
| `getValues()` / `getValues('a')` | `getValues(form)` / `getValue(form, 'a')` — the returned tree is read-only (deep-frozen in DEV) |
| `trigger('a')` → `Promise<boolean>` | `trigger(form, 'a')`; `trigger(form, 'a', {shouldFocus: true})` |
| `setError('a', {type, message})` | `setError(form, 'a', {type, message})` (a plain string is normalized to `{type: 'custom', message}`) |
| `clearErrors('a')` | `clearErrors(form, 'a')` |
| `reset(values?, options?)` | `reset(form, values?, options?)` — RHF's `keepValues/keepDirtyValues/keepErrors/keepTouched/keepIsSubmitted/keepIsSubmitSuccessful/keepSubmitCount` map directly |
| `resetField('a', {defaultValue, keepError, …})` | `resetField(form, 'a', {value, keepError, keepTouched, keepDirty})` (`value` plays `defaultValue`'s role) |
| `unregister('a', {keepValue, keepError, …})` | `removeField(form, 'a', {keepValue, keepDirty, keepTouched, keepError})` |
| `setFocus('a', {shouldSelect})` | `setFocus(form, 'a', {shouldSelect})` — rides the `'focusError'` channel, so bound fields focus through their `focusRef` |
| `getFieldState('a')` | `getFieldState(form, 'a')` → `{value, error, errors, isDirty, isTouched, isValidating}` |

### 9. Resolver swap

```diff
- import { zodResolver } from '@hookform/resolvers/zod';
- useForm({resolver: zodResolver(schema)});
+ import { standardSchemaFormValidator } from 'react-f0rm/resolvers/standard-schema';
+ useForm({validate: standardSchemaFormValidator(schema)});
```

Field-level (validate one value with a schema):

```ts
import { standardSchemaResolver } from 'react-f0rm/resolvers/standard-schema';
<Field name="email" validate={standardSchemaResolver(emailSchema)} />
```

The form-level adapter also preserves the schema's parsed output — coerced/transformed values land in `parsedValues` and `getValues()` returns them (`@hookform/resolvers` drops them). Every zod issue becomes its own `FieldError`, not just the first.

### 10. `FormProvider` → contexts

`FormProvider` + `useFormContext()` exist with the same names; pass the values shape for typing: `useFormContext<Values>()`. For multiple isolated forms per subtree, `createFormContext<Values>()` returns a typed bundle (`Ctx.useField`, `Ctx.useFieldArray`, `Ctx.useFormContext`, `Ctx.context` — the last plugs into `<Form context={Ctx.context}>`).

### 11. `useFieldArray`

```diff
- const {fields, append, remove} = useFieldArray({control, name: 'tags'});
+ const {fields, append, remove} = useFieldArray({name: 'tags'});
```

`fields[i].id` is the stable row key (`keyName: 'key'` exposes it as `field.key`), and `remove`, `swap`, `move`, `insert`, `prepend`, `append` map 1:1. Two additions: `replace(values)` (refetch shape — regenerates ids) and `update(index, value)` (in-place, id kept). Array-level `rules` (`required`, `minLength`, `maxLength` against the array) work like RHF's.

## Pitfalls

- **Unmount semantics are inverted.** RHF keeps values when a field unmounts (`shouldUnregister: false` default); react-f0rm tombstones them so they drop out of `getValues()`. A multi-step wizard that shows fields conditionally will lose step-2 values on unmount unless you set `createForm({shouldUnregister: false})` (or per field). Do this first when migrating.
- **`getValues()` is read-only.** The returned tree shares references across reads (copy-on-write cache) and is deep-frozen in development — mutating it throws at the offending line. `structuredClone` it when you need a mutable copy. RHF hands you live references; don't port code that writes through them.
- **Error shape is flat.** There is no `errors.items[0].name.message` tree — read `useError(form, 'items[0].name')`. Submission failure callbacks get the flat `{path, type, message}[]` list instead of `FieldErrors`.
- **`type` is per-error, not a mode.** RHF's `setError` `types` map / `criteriaMode` are one `FieldError[]` per field here — every rule failure and schema issue is its own entry, read via `errors`/`useFieldErrors`. `useError` returns the first entry's message.
- **Paths: numeric segments are bracket-only.** `'items.0.name'` throws a `TypeError` — spell it `'items[0].name'` (or `['items', 0, 'name']`). `'items["0"]'` names a string key.
- **`setValue` functions are updaters.** `setValue(form, 'count', c => c + 1)` updates from the current value (TanStack contract) — a function can never itself be stored as a field value.
- **Native constraint validation always gates submit.** `<Form>` renders `noValidate` and runs `checkValidity()` before custom validators; failed native constraints surface via `reportValidity()` and stop submission (`onInvalidSubmit` fires). There is no `shouldUseNativeValidation` opt-out flag.
- **No no-JS submit.** `<Form action>` takes a function (Server Action target) that runs after validation — the browser never submits natively (deliberate; the values store, not the DOM, is the source of truth). RHF's native `action` prop behavior has no counterpart.
- **Rule messages are static strings.** RHF accepts `message: ({min}) => …` templates per rule; react-f0rm `rules` take string messages (per-rule via `messages`, `required` inline). Dynamic text belongs in your own error rendering, reading the `FieldError` (`type` carries the rule name).
- **`onTouched` mode** means the same thing: validate on first blur, then on every change.
- **StrictMode double-validation.** Per-field validators may run twice on mount in dev StrictMode (effects run twice) — cancellation keeps the last round's result.
