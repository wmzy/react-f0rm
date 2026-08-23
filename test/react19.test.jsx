/**
 * React 19 Server Actions / useActionState integration tests.
 *
 * The repo's dev dependency is React 18.3, which has no useActionState, so
 * the bridge logic is verified through useActionStateShim — a hand-rolled
 * [state, dispatch, isPending] triple with the same contract React 19
 * documents (dispatch calls action(prevState, payload); isPending covers
 * the in-flight action). The shim omits only the Transition scheduling
 * React 19 requires for manual dispatches (see the React docs: wrap manual
 * dispatchAction calls in startTransition). Everything else — the
 * handleSubmit/onValidSubmit gate, values (not FormData) reaching the
 * action, pending-state coexistence — is the production bridge logic and
 * runs unmodified here.
 */
import {describe, it, expect, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import Form from '../src/components/Form';
import {Field} from '../src/components/Field';
import {
  useForm,
  useIsSubmitting,
  handleSubmit,
  setValue,
  getValues
} from '../src';

/** React 18 stand-in for React 19's useActionState return triple. */
function useActionStateShim(action, initialState) {
  const [state, setState] = React.useState(initialState);
  const [isPending, setIsPending] = React.useState(false);
  const dispatch = payload => {
    setIsPending(true);
    Promise.resolve(action(state, payload))
      .then(setState)
      .finally(() => setIsPending(false));
  };
  return [state, dispatch, isPending];
}

function deferred() {
  let resolve;
  const promise = new Promise(r => (resolve = r));
  return {promise, resolve};
}

describe('React 19 server action bridge', () => {
  it('dispatches the action from onValidSubmit with values (not FormData), preserving types', async () => {
    const action = vi.fn(async (prev, values) => ({ok: true, saved: values}));
    const user = userEvent.setup();

    function Bridge() {
      const [result, dispatch] = useActionStateShim(action, null);
      // Doc pattern: <Form> runs handleSubmit internally — onValidSubmit is
      // the validated bridge point where getValues() flows to the action.
      return (
        <Form
          initialValues={{email: '', count: 3}}
          onValidSubmit={values => dispatch(values)}
        >
          <Field name="email" />
          <Field name="count" type="number" />
          <output>{result ? result.saved.email : 'idle'}</output>
          <button type="submit">Save</button>
        </Form>
      );
    }

    render(<Bridge />);
    await user.type(screen.getByRole('textbox'), 'a@b.c');
    await user.click(screen.getByRole('button', {name: 'Save'}));

    await vi.waitFor(() => {
      expect(screen.getByRole('status' /* <output> */).textContent).toBe(
        'a@b.c'
      );
    });
    expect(action).toHaveBeenCalledTimes(1);
    const [, values] = action.mock.calls[0];
    // The action receives the values object: nested state, numbers intact.
    expect(values).toEqual({email: 'a@b.c', count: 3});
    expect(typeof values.count).toBe('number');
  });

  it('headless useForm + handleSubmit bridges the same way', async () => {
    const action = vi.fn(async (prev, values) => ({saved: values.email}));
    const user = userEvent.setup();

    function Headless() {
      const form = useForm({initialValues: {email: ''}});
      return (
        <form
          onSubmit={handleSubmit(form, {
            onValidSubmit: values => action(values, null)
          })}
        >
          <Field name="email" form={form} />
          <button type="submit">Save</button>
        </form>
      );
    }

    render(<Headless />);
    await user.type(document.querySelector('input'), 'x@y.z');
    await user.click(screen.getByRole('button', {name: 'Save'}));
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0][0]).toEqual({email: 'x@y.z'});
  });

  it('validation gates the action: invalid submits never dispatch', async () => {
    const action = vi.fn(async () => ({ok: true}));
    const onInvalidSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form
        initialValues={{email: ''}}
        onValidSubmit={values => action(values)}
        onInvalidSubmit={onInvalidSubmit}
      >
        <Field name="email" validate={v => (v ? undefined : 'Required')} />
        <button type="submit">Save</button>
      </Form>
    );

    await user.click(screen.getByRole('button', {name: 'Save'}));
    await vi.waitFor(() => expect(onInvalidSubmit).toHaveBeenCalledTimes(1));
    expect(action).not.toHaveBeenCalled();
  });

  it('isSubmitting and isActionPending abut across the dispatch boundary; the union holds the button', async () => {
    const gate = deferred();
    const action = vi.fn(() => gate.promise);
    const user = userEvent.setup();

    function Coexisting() {
      const form = useForm({initialValues: {email: ''}});
      const [, dispatch, isActionPending] = useActionStateShim(action, null);
      const isSubmitting = useIsSubmitting(form);
      return (
        <Form
          form={form}
          initialValues={{email: 'a@b.c'}}
          onValidSubmit={values => dispatch(values)}
        >
          <Field name="email" form={form} />
          <output>
            {isSubmitting ? 'submitting' : isActionPending ? 'pending' : 'idle'}
          </output>
          <button type="submit" disabled={isSubmitting || isActionPending}>
            Save
          </button>
        </Form>
      );
    }

    render(<Coexisting />);
    await user.click(screen.getByRole('button', {name: 'Save'}));

    // While the action is in flight the union of both flags holds the button.
    await vi.waitFor(() =>
      expect(screen.getByRole('button').disabled).toBe(true)
    );
    expect(screen.getByRole('status').textContent).toBe('pending');

    await act(async () => {
      gate.resolve({ok: true});
    });
    await vi.waitFor(() =>
      expect(screen.getByRole('button').disabled).toBe(false)
    );
    expect(screen.getByRole('status').textContent).toBe('idle');
  });

  it('awaiting the action inside onValidSubmit keeps form.isSubmitting true through the flight', async () => {
    const gate = deferred();
    const user = userEvent.setup();

    function Awaited() {
      const form = useForm({initialValues: {email: 'a@b.c'}});
      const isSubmitting = useIsSubmitting(form);
      return (
        <Form
          form={form}
          initialValues={{email: 'a@b.c'}}
          onValidSubmit={() => gate.promise}
        >
          <Field name="email" form={form} />
          <output>{isSubmitting ? 'submitting' : 'idle'}</output>
          <button type="submit" disabled={isSubmitting}>
            Save
          </button>
        </Form>
      );
    }

    render(<Awaited />);
    await user.click(screen.getByRole('button', {name: 'Save'}));
    await vi.waitFor(() => {
      expect(screen.getByRole('button').disabled).toBe(true);
      expect(screen.getByRole('status').textContent).toBe('submitting');
    });

    await act(async () => {
      gate.resolve();
    });
    await vi.waitFor(() =>
      expect(screen.getByRole('button').disabled).toBe(false)
    );
  });
});

describe('why a bare <form action={serverAction}> does not fit controlled fields', () => {
  it('FormData collects Field inputs under internal JSON path keys, not field names', async () => {
    const user = userEvent.setup();
    let formRef;

    function Keys() {
      const form = useForm({initialValues: {email: '', profile: {name: ''}}});
      formRef = form;
      return (
        <Form form={form} initialValues={{email: '', profile: {name: ''}}}>
          <Field name="email" form={form} />
          <Field name={['profile', 'name']} form={form} />
          <button type="submit">Save</button>
        </Form>
      );
    }

    render(<Keys />);

    const inputs = document.querySelectorAll('input');
    await user.type(inputs[0], 'a@b.c');
    await user.type(inputs[1], 'Ada');

    // React 19 action props build FormData from the live form element.
    const formData = new FormData(document.querySelector('form'));
    expect([...formData.keys()]).toEqual(['["email"]', '["profile","name"]']);
    // The server would have to parse JSON-stringified path keys to read it.
    expect(formData.get('["email"]')).toBe('a@b.c');

    // getValues() returns the same data under natural paths.
    expect(getValues(formRef)).toEqual({
      email: 'a@b.c',
      profile: {name: 'Ada'}
    });
  });

  it('values without a mounted DOM control never reach FormData but do reach the action', async () => {
    const action = vi.fn(async (prev, values) => values);
    const user = userEvent.setup();
    let formRef;

    function Hidden() {
      const form = useForm({
        initialValues: {email: '', token: '', custom: 'shown'}
      });
      formRef = form;
      return (
        <Form
          form={form}
          initialValues={{email: '', token: '', custom: 'shown'}}
          onValidSubmit={values => action(values)}
        >
          <Field name="email" />
          {/* Custom as renders no DOM input: invisible to FormData. */}
          <Field name="custom" as={({value}) => <em>{value}</em>} />
          <button type="submit">Save</button>
        </Form>
      );
    }

    render(<Hidden />);
    await user.type(document.querySelector('input'), 'a@b.c');
    // Programmatic value with no DOM control at all.
    setValue(formRef, 'token', 's3cret');

    const formData = new FormData(document.querySelector('form'));
    expect(formData.get('["token"]')).toBeNull();
    expect(formData.get('["custom"]')).toBeNull();

    await user.click(screen.getByRole('button', {name: 'Save'}));
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    // The onValidSubmit bridge carries the complete values object anyway.
    expect(action.mock.calls[0][0]).toEqual({
      email: 'a@b.c',
      token: 's3cret',
      custom: 'shown'
    });
  });
});
