import * as React from 'react';
import type {StoryObj, Meta} from '@storybook/react-vite';

import Form from '../src/components/Form';
import {Field} from '../src/components/Field';
import {useFormContext, useIsSubmitting} from '../src';

const meta = {
  title: 'ReactF0rm/React19',
  component: Form
} as Meta;

export default meta;

/**
 * React 18 stand-in for React 19's useActionState triple
 * [state, dispatch, isPending]. On React 19 replace with:
 *   const [result, formAction, isActionPending] = useActionState(action, null);
 * — and wrap manual dispatches in startTransition (React tracks isPending
 * only inside transitions; action props wrap it for you, manual calls don't).
 */
function useActionStateShim(
  action: (prevState: any, payload: any) => Promise<any>,
  initialState: any
) {
  const [state, setState] = React.useState(initialState);
  const [isPending, setIsPending] = React.useState(false);
  const dispatch = (payload: any) => {
    setIsPending(true);
    Promise.resolve(action(state, payload))
      .then(setState)
      .finally(() => setIsPending(false));
  };
  return [state, dispatch, isPending] as const;
}

/** Fake 'use server' action: resolves after a delay, like a network hop. */
const saveProfile = async (_prev: any, values: any) => {
  await new Promise((r) => setTimeout(r, 800));
  return {ok: true, saved: values.email};
};

/**
 * Pattern 1 — useActionState owns the server state + action pending flag;
 * <Form> (which runs handleSubmit internally) validates first and dispatches
 * the action from onValidSubmit with the values object, never FormData.
 */
function ProfileForm() {
  const [result, dispatch, isActionPending] = useActionStateShim(
    saveProfile,
    null
  );

  return (
    <Form
      initialValues={{email: '', plan: 'free'}}
      onValidSubmit={(values) => dispatch(values)}
    >
      <h3>Edit profile</h3>
      <p>
        <label>
          Email{' '}
          <Field name="email" type="email" placeholder="you@example.com" />
        </label>
      </p>
      <p>
        <label>
          Plan{' '}
          <Field name="plan" as="select">
            <option>free</option>
            <option>pro</option>
          </Field>
        </label>
      </p>
      <button type="submit" disabled={isActionPending}>
        {isActionPending ? 'Saving…' : 'Save'}
      </button>{' '}
      {result?.ok ? <strong>Saved {result.saved}</strong> : null}
    </Form>
  );
}

function SubmitButton() {
  const form = useFormContext();
  const isSubmitting = useIsSubmitting(form);
  return (
    <button type="submit" disabled={isSubmitting}>
      {isSubmitting ? 'Saving…' : 'Save'}
    </button>
  );
}

/**
 * Pattern 2 — await the server action inside onValidSubmit: handleSubmit
 * awaits the callback, so form.isSubmitting covers the whole flight and a
 * single flag drives the button.
 */
function AwaitedProfileForm() {
  const [saved, setSaved] = React.useState<string>();

  return (
    <Form
      initialValues={{email: ''}}
      onValidSubmit={async (values) => {
        const result = await saveProfile(null, values);
        setSaved(result.saved);
      }}
    >
      <h3>Edit profile</h3>
      <p>
        <label>
          Email{' '}
          <Field name="email" type="email" placeholder="you@example.com" />
        </label>
      </p>
      <SubmitButton /> {saved ? <strong>Saved {saved}</strong> : null}
    </Form>
  );
}

export const ActionStateBridge: StoryObj<typeof Form> = {
  name: 'useActionState bridge',
  render: () => <ProfileForm />
};

export const AwaitedServerAction: StoryObj<typeof Form> = {
  name: 'awaited action keeps isSubmitting',
  render: () => <AwaitedProfileForm />
};
