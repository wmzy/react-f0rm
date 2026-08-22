# React 19 Server Actions

React 19 ships [Actions](https://react.dev/reference/react/useActionState) — functions passed to `<form action>` or managed with `useActionState`, typically Server Functions marked with `'use server'`. This guide shows how to bridge them with react-f0rm's validation pipeline so the action only runs for validated submits, and receives live values instead of raw `FormData`.

`useActionState` and `startTransition` require React 19. The bridge itself — validation gating the action, `getValues()` flowing to it, pending-state coexistence — is plain React 18-compatible logic, and is exactly what [`test/react19.test.jsx`](https://github.com/wmzy/react-f0rm/blob/main/test/react19.test.jsx) verifies (via a hand-rolled `useActionState` stand-in, since the repo's own tests run React 18.3).

## Why not `<form action={serverAction}>`

With react-f0rm the source of truth is the form's values store, not the DOM. Pointing the `action` prop straight at a server action breaks in four ways:

1. **Field names are internal path keys.** `<Field name={['profile', 'name']}>` renders `<input name='["profile","name"]'>` — the FormData your action receives is keyed by JSON-stringified paths, not your field names.
2. **Values without a DOM control never arrive.** Custom `as` components that render no `<input>`, values set programmatically with `setValue`, and field-array entries kept after unmount all live in the values store only — `FormData` cannot see them. `getValues()` always can.
3. **Types are lost.** FormData entries are strings; `getValues()` preserves numbers, booleans and nested objects as they were committed.
4. **Validation is skipped.** A bare `action` prop bypasses `handleSubmit` entirely: no custom validators, no `onInvalidSubmit`, no focus-on-error.

And you can't fix it by combining `action={formAction}` with `onSubmit={handleSubmit(...)}`: `handleSubmit` always calls `preventDefault()` first, which cancels the action dispatch. Everything must flow through the submit callbacks.

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
- **`startTransition` is required** for manual dispatches: React only tracks `isPending` inside transitions. (Passing the dispatch to an `action` prop wraps it automatically — but see above why the `action` prop doesn't fit here.)
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
- **Progressive enhancement caveat**: because submission flows through `onSubmit` rather than the `action` prop, the form cannot submit before JavaScript loads. That is inherent to client-side validation gating, not specific to react-f0rm.
- **Always re-validate on the server** — the client-side gate is UX, not security.
