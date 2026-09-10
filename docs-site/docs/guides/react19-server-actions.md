# React 19 Server Actions

React 19 ships [Actions](https://react.dev/reference/react/useActionState) — functions passed to `<form action>` or managed with `useActionState`, typically Server Functions marked with `'use server'`. This guide shows how to bridge them with react-f0rm's validation pipeline so the action only runs for validated submits, and receives live values instead of raw `FormData`.

`useActionState` and `startTransition` require React 19. The bridge itself — validation gating the action, `getValues()` flowing to it, pending-state coexistence — is plain React 18-compatible logic, and is exactly what [`test/react19.test.jsx`](https://github.com/wmzy/react-f0rm/blob/main/test/react19.test.jsx) verifies (via a hand-rolled `useActionState` stand-in, since the repo's own tests run React 18.3).

## Why not the native `<form action={serverAction}>`

With react-f0rm the source of truth is the form's values store, not the DOM. Pointing the browser's native `action` attribute straight at a server action breaks in four ways — note this is about the native attribute (`<form action={…}>`, React's progressive-enhancement dispatch); react-f0rm's own `<Form action={fn}>` **callback prop** is different and supported, see below:

1. **Field names are internal path keys.** `<Field name={['profile', 'name']}>` renders `<input name='["profile","name"]'>` — the FormData your action receives is keyed by JSON-stringified paths, not your field names.
2. **Values without a DOM control never arrive.** Custom `as` components that render no `<input>`, values set programmatically with `setValue`, and field-array entries kept after unmount all live in the values store only — `FormData` cannot see them. `getValues()` always can.
3. **Types are lost.** FormData entries are strings; `getValues()` preserves numbers, booleans and nested objects as they were committed.
4. **Validation is skipped.** A bare `action` prop bypasses `handleSubmit` entirely: no custom validators, no `onInvalidSubmit`, no focus-on-error.

And you can't fix it by combining `action={formAction}` with `onSubmit={handleSubmit(...)}`: `handleSubmit` always calls `preventDefault()` first, which cancels the action dispatch. Everything must flow through the submit callbacks.

## The library's own `<Form action={fn}>` prop

`<Form action={fn}>` is not the native attribute above: `<Form>` never renders the browser's `action` — it runs `handleSubmit` internally and calls `fn` **after** validation passes, with `formDataFromValues(values)` — FormData built from the values store (real field names, arrays as repeated entries, `Date` → ISO string, objects → JSON, `null`/`undefined` skipped). Server Functions written for RHF-style FormData payloads work unchanged:

```tsx
import {Form, Field} from 'react-f0rm';
import {createUser} from './actions'; // 'use server', accepts FormData

<Form initialValues={{email: ''}} action={createUser}>
  <Field name="email" type="email" required />
  <button type="submit">Create</button>
</Form>
```

The four failure modes above do not apply: the payload comes from the values store (not DOM name attributes), the validation gate runs first (invalid submits fire `onInvalidSubmit` and never reach the action), and `isSubmitting` covers the flight. What it does not give you by itself is progressive enhancement — the browser cannot submit before JavaScript loads — which the string-`action` form below restores.

**Server rejection lands on the fields.** The action may return `{errors: {...}}` — a field-path → message(s) record: it lands as per-field `type: 'server'` errors (replacing the previous round trip's verdict), the submit counts as unsuccessful, and `renderError`/`aria-invalid`/`useError` all pick it up — Conform's server-error hydration, folded into the action contract:

```tsx
<Form initialValues={{email: ''}} action={createUser}>
  <Field name="email" renderError={(e) => e} />
  <button type="submit">Create</button>
</Form>
```

```tsx
// actions.ts
'use server';

export async function createUser(formData: FormData) {
  const email = String(formData.get('email'));
  if (await isTaken(email)) {
    return {errors: {email: 'already registered'}};
  }
  // ...create the user
  // undefined = success
}
```

Any other return value (including `undefined`) counts as success; a thrown action marks the submit unsuccessful. The headless `handleSubmit({onAction})` has the same `ActionErrorResult` contract. A retry after a rejection is judged fresh: the next submit attempt clears the previous round's server errors before validating (client errors still gate), so a fixed payload never fights a stale verdict.

## Progressive enhancement: `action` as a URL

Pass a URL string to `action` and it renders as the form's native `action` attribute instead of a callback: without JavaScript the browser posts the raw FormData to it (the native constraint attributes derived from declarative `rules` still gate invalid submits), and with JavaScript `handleSubmit` runs the validated pipeline and preventDefaults the native post — perform the network call in `onValidSubmit`:

```tsx
import {Form, Field} from 'react-f0rm';
import {formDataFromValues} from 'react-f0rm/server';

<Form
  initialValues={{email: ''}}
  action="/api/register"
  method="post"
  onValidSubmit={(values) =>
    fetch('/api/register', {method: 'POST', body: formDataFromValues(values)})
  }
>
  <Field name="email" rules={{required: true}} />
  <button type="submit">Create</button>
</Form>
```

`formDataFromValues` (from `react-f0rm/server`) builds the same payload for the JS path that the browser would post natively — arrays as repeated entries, files passthrough, dates as ISO strings.

## Parsing FormData back: `valuesFromFormData`

A Server Action that receives the FormData — the `<Form action={fn}>` dispatch, a native no-JS post, or any multipart handler — parses it back with `valuesFromFormData` (the inverse of `formDataFromValues`, also from `react-f0rm/server`) and feeds the result straight to `validateValues` — zero hand-rolled `.get()` calls:

```tsx
// actions.ts
'use server';

import {valuesFromFormData, validateValues} from 'react-f0rm/server';
import {standardSchemaFormValidator} from 'react-f0rm/resolvers/standard-schema';
import {registerSchema} from './schemas';

export async function register(formData: FormData) {
  const result = await validateValues(valuesFromFormData(formData), {
    validate: standardSchemaFormValidator(registerSchema)
  });
  if (!result.valid) {
    // result.errors is the flat FieldErrorEntry[] — feed it to the
    // client's setServerErrors, or re-render the server form directly.
    return {errors: result.errors};
  }
  // result.values carries the schema-coerced tree (z.coerce.number() etc.)
  await db.users.insert(result.values);
}
```

The parser follows native form conventions: repeated keys collect into arrays, File entries pass through, and strings that look like JSON (`{…}`/`[…]` — the shape `formDataFromValues` gives plain objects) parse back to their structure; everything else stays a string, so let the schema coerce scalar types back (`z.coerce.number()`), exactly as a native submit would require.

## Pattern: `useActionState` + `onValidSubmit`

`<Form>` runs `handleSubmit` internally (see [Submission](./submission.md)), so `onValidSubmit` is the bridge point: it fires only after native constraints *and* custom validators pass, receiving the values object.

```tsx
'use client';

import {useActionState, startTransition} from 'react';
import {Form, Field} from 'react-f0rm';
import {saveProfile} from './actions'; // 'use server' module

function ProfileForm() {
  const [result, formAction, isActionPending] = useActionState(saveProfile, null);

  return (
    <Form
      initialValues={{email: '', plan: 'free'}}
      onValidSubmit={(values) => startTransition(() => formAction(values))}
    >
      <Field name="email" type="email" required />
      <Field name="plan" as="select">
        <option value="free">Free</option>
        <option value="pro">Pro</option>
      </Field>
      <button type="submit" disabled={isActionPending}>
        {isActionPending ? 'Saving…' : 'Save'}
      </button>
      {result && !result.ok && <p role="alert">{result.error}</p>}
    </Form>
  );
}
```

```tsx
// actions.ts
'use server';

// previousState comes from useActionState; the payload is whatever you
// dispatch — here the values object, not FormData.
export async function saveProfile(previousState, values) {
  // Re-validate on the server — never trust the client's gate.
  ...
  return {ok: true};
}
```

Three details that make this work:

- **`formAction(values)`** — the dispatch's argument becomes the action's second parameter. It doesn't have to be `FormData`; passing the values object keeps names, nesting and types intact.
- **`startTransition` is required** for manual dispatches: React only tracks `isPending` inside transitions. (Passing the dispatch to the library's own `<Form action>` prop wraps it automatically — the payload becomes `formDataFromValues(values)`, FormData, so that shape only fits server functions accepting FormData; see above.)
- **Validation gates the dispatch.** Invalid submits fire `onInvalidSubmit` and focus the first error field; the action never runs.

The headless variant is identical, with `handleSubmit` wired by hand (see [`useForm`](../api/use-form.md)):

```tsx
import {useForm, handleSubmit, Field} from 'react-f0rm';

function ProfileForm() {
  const form = useForm({initialValues: {email: ''}});
  const [result, formAction, isActionPending] = useActionState(saveProfile, null);

  return (
    <form
      onSubmit={handleSubmit(form, {
        onValidSubmit: (values) => startTransition(() => formAction(values))
      })}
    >
      <Field name="email" form={form} type="email" required />
      <button type="submit" disabled={isActionPending}>Save</button>
    </form>
  );
}
```

## Pattern: await the action, use one flag

If you don't need `useActionState`'s previous-state chaining, skip it — call the server action directly and await it:

```tsx
'use client';

import {useState} from 'react';
import {Form, Field, useFormContext, useIsSubmitting} from 'react-f0rm';
import {saveProfile} from './actions';

function SubmitButton() {
  const form = useFormContext();
  const isSubmitting = useIsSubmitting(form);
  return (
    <button type="submit" disabled={isSubmitting}>
      {isSubmitting ? 'Saving…' : 'Save'}
    </button>
  );
}

function ProfileForm() {
  const [error, setError] = useState();

  return (
    <Form
      initialValues={{email: ''}}
      onValidSubmit={async (values) => {
        const result = await saveProfile(undefined, values);
        if (!result.ok) setError(result.error);
      }}
    >
      <Field name="email" type="email" required />
      <SubmitButton />
      {error && <p role="alert">{error}</p>}
    </Form>
  );
}
```

`handleSubmit` awaits `onValidSubmit`, so `form.isSubmitting` stays `true` from the submit click, through validation, until the server round-trip resolves — one flag covers the whole window.

## `isSubmitting` vs `isPending`

| Flag | Covers |
| --- | --- |
| `useIsSubmitting(form)` | Submit click → validation (including async client validators) → dispatch; plus the action flight itself if you await it in `onValidSubmit`. |
| `isActionPending` from `useActionState` | Only the dispatched action's flight — regardless of where it was dispatched from. |

With the `startTransition(() => formAction(values))` bridge (no await), the two flags abut rather than overlap: `isSubmitting` ends when the dispatch happens, `isActionPending` picks it up. Disable the submit button on the **union** — `disabled={isSubmitting || isActionPending}` — so neither phase leaves a gap. If you await the action instead (previous pattern), `isSubmitting` alone suffices.

The `state` returned by `useActionState` is your action's return value; react-f0rm knows nothing about it — render success/error UI from it yourself.

## Next.js App Router notes

- **Component boundaries**: the form component must be a client component (`'use client'`) — `useForm` and friends are hooks. The action lives in a `'use server'` module; importing it from the client component is fine (Next.js compiles it to an RPC reference). Only Server Actions may cross the server→client boundary — never the form instance or its values.
- **SSR & hydration**: react-f0rm subscribes through `useSyncExternalStore` with a server snapshot that matches the first client render, so the server-rendered markup hydrates cleanly.
- **`useFormStatus` won't see your submits**: that hook only tracks actions dispatched through `<form action>` props. With this bridge, use `useIsSubmitting(form)` or the action's own `isPending` instead.
- **Progressive enhancement caveat**: when submission flows through `onSubmit`/`onValidSubmit` rather than a URL, the form cannot submit before JavaScript loads — inherent to client-side validation gating, not specific to react-f0rm. For no-JS submits, pass the endpoint as a URL string to `action` (see [Progressive enhancement](#progressive-enhancement-action-as-a-url)): the browser posts natively without JS, the validated pipeline takes over with it.
- **Always re-validate on the server** — the client-side gate is UX, not security.
