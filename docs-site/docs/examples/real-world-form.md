---
sidebar_position: 3
---

# Real-world Form

One cohesive form exercising the pieces real business flows need: a multi-step wizard (`setStatus`/`useStatus`), cross-field validation with the submit-then-fix flow (`validateDeps`), async field validation with cancellation (`validateDebounce` + `meta.signal`), and server rejection backfill (`onAction` returning `{errors}` — the React 19 Server Action round trip).

```tsx
import React from 'react';
import {z} from 'zod';
import {
  Form,
  Field,
  useFormContext,
  useStatus,
  setStatus,
  useCanSubmit,
  useIsValidating,
  useFieldArray,
  trigger,
  type FormInstance
} from 'react-f0rm';
import {standardSchemaFormValidator} from 'react-f0rm/resolvers/standard-schema';

// The schema: field rules + the cross-field password match live here. Its
// parsed output (z.coerce, transforms) becomes the submitted values.
const schema = z
  .object({
    email: z.string().email('Invalid email'),
    username: z.string().min(3, 'At least 3 characters'),
    password: z.string().min(8, 'At least 8 characters'),
    confirm: z.string(),
    tags: z.array(z.string())
  })
  .refine(v => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm']
  });

interface Values { email: string; username: string; password: string; confirm: string; tags: string[]; }

// One async field validator: debounced, abortable, and only consulted for
// filled values (required rules short-circuit it otherwise).
async function checkUsername(value: string, {signal}: {signal: AbortSignal}) {
  if (!value) return;
  const res = await fetch(`/api/check-username?u=${encodeURIComponent(value)}`, {signal});
  if (res.status === 409) return {type: 'taken', message: 'Username already taken'};
}

// A Server Action. Returning {errors} hydrates the fields as type: 'server'
// errors and counts the submit unsuccessful — 422 backfill with zero glue.
async function createAccount(formData: FormData) {
  'use server';
  // validateValues(formData, {validate: schema}) re-validates server-side;
  // on failure return {errors} with the flattened entries.
  return {errors: {email: 'Already registered, try logging in'}};
}

function StepControls() {
  const form = useFormContext<Values>();
  const step = useStatus(form)?.step ?? 1;
  const canSubmit = useCanSubmit(form);
  const isValidating = useIsValidating(form);
  return (
    <div>
      {step > 1 && (
        <button type="button" onClick={() => setStatus(form, {step: step - 1})}>
          Back
        </button>
      )}
      {step < 2 ? (
        <button
          type="button"
          disabled={isValidating}
          onClick={async () => {
            // Validate the first step's scope before advancing; the values
            // were schema-coerced on the last successful round.
            if (await triggerStep(form)) setStatus(form, {step: 2});
          }}
        >
          Next
        </button>
      ) : (
        <button type="submit" disabled={!canSubmit || isValidating}>
          {isValidating ? 'Checking…' : 'Create account'}
        </button>
      )}
    </div>
  );
}

function triggerStep(form: FormInstance<Values>) {
  return trigger(form, ['email', 'username', 'password', 'confirm'], {
    shouldTouch: true
  });
}

function TagsField() {
  const {fields, append, remove} = useFieldArray<{value: string}>({name: 'tags'});
  return (
    <div>
      {fields.map((field, index) => (
        <div key={field.id}>
          <Field name={['tags', index, 'value']} placeholder="tag" />
          <button type="button" onClick={() => remove(index)}>×</button>
        </div>
      ))}
      <button type="button" onClick={() => append({value: ''})}>Add tag</button>
    </div>
  );
}

export default function SignupWizard() {
  return (
    <Form<Values>
      initialValues={{
        email: '',
        username: '',
        password: '',
        confirm: '',
        tags: [{value: ''}]
      }}
      validate={standardSchemaFormValidator(schema)}
      validateDeps={['password', 'confirm']}   // cross-field fix: edit either,
                                               // the confirm mismatch re-runs
      action={createAccount}                   // server rejection lands itself
      onValidSubmit={values => console.log('created', values)}
    >
      <StepOne />
      <StepTwo />
      <StepControls />
    </Form>
  );
}

function StepOne() {
  const step = useStatus(useFormContext<Values>())?.step ?? 1;
  if (step !== 1) return null;
  return (
    <fieldset>
      <Field name="email" type="email" rules={{required: true}} renderError={e => <em>{e}</em>} />
      <Field name="username" validateDebounce={300} validate={checkUsername} renderError={e => <em>{e}</em>} />
      <Field name="password" type="password" rules={{minLength: 8}} renderError={e => <em>{e}</em>} />
      <Field name="confirm" type="password" renderError={e => <em>{e}</em>} />
    </fieldset>
  );
}

function StepTwo() {
  const step = useStatus(useFormContext<Values>())?.step ?? 1;
  if (step !== 2) return null;
  return <TagsField />;
}
```

What each piece demonstrates:

- **Wizard state** rides the form's `status` slot (`setStatus`/`useStatus`) — the step index is form metadata, not a `useState` twin; `reset` keeps it until you decide otherwise.
- **Cross-field validation** is one schema `.refine` + `validateDeps: ['password', 'confirm']`: the first submit lands "Passwords do not match" on `confirm`, then editing either field re-runs the form validate and a match clears it — no manual re-validation bookkeeping.
- **Async field validation** gets debounce and cancellation for free — the `checkUsername` fetch aborts when a newer keystroke supersedes it, and pending windows count as validating (the submit button waits).
- **Server rejection backfill** needs no `setServerErrors` call: the Server Action returns `{errors: {email: …}}`, `onAction` lands it as `type: 'server'` under the field, marks the attempt unsuccessful, and the next attempt is judged fresh (the stale verdict never vetoes it).
- **Field arrays** bind rows with segment paths (`['tags', index, 'value']`) while `useFieldArray`'s stable row ids key the DOM.
- **`trigger` with `shouldTouch`** gates the wizard's Next button: advancing validates the first step's scope and marks it touched, so a later full submit re-renders those errors consistently.

See [Validation](../guides/validation.md), [Field Arrays](../guides/field-arrays.md), [Submission](../guides/submission.md) and the [Server Actions guide](../guides/react19-server-actions.md) for the individual mechanics.
