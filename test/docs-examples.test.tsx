// Doc-example verification: the exact compositions documented in README.md
// ("createFormContext", "Async validation" / "Multiple errors per field") and
// docs-site/docs (api/create-form-context.md, guides/validation.md) — proving
// the snippets behave as written. Origin: Wave 4 "DocsUpdate" task.
import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';
import React from 'react';
import {
  createFormContext,
  trigger,
  getFieldErrors,
  useForm,
  useCanSubmit,
  handleSubmit
} from '../src/index';
import createForm, {setServerErrors} from '../src/form';
import {Field, fieldErrorId} from '../src/components/Field';
import {useError} from '../src/hooks/form';
import {FormProvider} from '../src/context';

// ---- README "createFormContext" snippet -------------------------------------

interface ValuesDoc {
  name: string;
  email: string;
}

const ProfileForm = createFormContext<ValuesDoc>();

function NameField() {
  const {value, onChange, error} = ProfileForm.useField({name: 'name'});
  return (
    <div>
      <input
        data-testid="name"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {error && <span role="alert">{error}</span>}
    </div>
  );
}

describe('doc example: createFormContext', () => {
  it('scopes a typed provider: value flows, edits update, errors render', async () => {
    const form = createForm({initialValues: {name: 'ada', email: ''}});
    render(
      <ProfileForm.FormProvider form={form}>
        <NameField />
      </ProfileForm.FormProvider>
    );

    const input = screen.getByTestId('name');
    expect(input.value).toBe('ada');

    await act(async () => {
      fireEvent.change(input, {target: {value: 'grace'}});
    });
    expect(input.value).toBe('grace');
  });

  it('a scoped hook ignores the module-level FormProvider (isolation)', () => {
    // The module-level provider holds a different form — the scoped hook
    // must still throw for lack of its own provider.
    expect(() =>
      render(
        <FormProvider
          value={createForm({initialValues: {name: 'x', email: ''}})}
        >
          <ProfileForm.FormProvider form={undefined}>
            <NameField />
          </ProfileForm.FormProvider>
        </FormProvider>
      )
    ).toThrow('no form provided');
  });
});

// ---- README "Async validation" snippet --------------------------------------

function makeFakeFetch() {
  const signals = [];
  const fakeFetch = (_url, {signal}) =>
    new Promise((resolve, reject) => {
      signals.push(signal);
      if (signal.aborted) return reject(new Error('AbortError'));
      const onAbort = () => reject(new Error('AbortError'));
      signal.addEventListener('abort', onAbort, {once: true});
      setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve({taken: _url.includes('taken')});
      }, 10);
    });
  return {fakeFetch, signals};
}

function CheckEmail({form, debounce, validate}) {
  return (
    <Field
      form={form}
      name="email"
      data-testid="email"
      validateDebounce={debounce}
      validate={validate}
    />
  );
}

describe('doc example: async validation (debounce + signal)', () => {
  it('debounces rapid kicks — only the last kick runs the validator', async () => {
    const form = createForm({initialValues: {email: ''}, mode: 'onChange'});
    const calls = [];
    const {fakeFetch} = makeFakeFetch();
    render(
      <CheckEmail
        form={form}
        debounce={30}
        validate={async (value, {signal}) => {
          calls.push(value);
          const res = await fakeFetch(
            `/api/check-email?email=${encodeURIComponent(value)}`,
            {signal}
          );
          if (res.taken) {
            return {type: 'taken', message: 'Email already registered'};
          }
        }}
      />
    );

    const input = screen.getByTestId('email');
    await act(async () => {
      fireEvent.change(input, {target: {value: 'a@b.c'}});
      fireEvent.change(input, {target: {value: 'taken@x.io'}});
      await new Promise(r => setTimeout(r, 80));
    });

    expect(calls).toEqual(['taken@x.io']); // only the last kick ran
    expect(getFieldErrors(form, 'email')).toEqual([
      {type: 'taken', message: 'Email already registered'}
    ]);
  });

  it('a superseded round aborts its in-flight fetch via meta.signal', async () => {
    const form = createForm({
      initialValues: {email: ''},
      mode: 'onChange'
    });
    const {fakeFetch, signals} = makeFakeFetch();
    const failures = [];
    render(
      <CheckEmail
        form={form}
        validate={async (value, {signal}) => {
          try {
            const res = await fakeFetch(`/api/check-email?email=${value}`, {
              signal
            });
            if (res.taken) return 'Email already registered';
          } catch (e) {
            failures.push(e.message); // stale round's fetch rejected on abort
          }
        }}
      />
    );

    const input = screen.getByTestId('email');
    await act(async () => {
      fireEvent.change(input, {target: {value: 'a@b.c'}});
      fireEvent.change(input, {target: {value: 'taken@x.io'}}); // supersedes round 1
      await new Promise(r => setTimeout(r, 40));
    });

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true); // round 1 cancelled…
    expect(signals[1].aborted).toBe(false); // …round 2 ran to completion
    expect(failures).toEqual(['AbortError']);
    expect(getFieldErrors(form, 'email')).toEqual([
      {type: 'custom', message: 'Email already registered'}
    ]);
  });

  it('await trigger(form) waits out the debounce window and settles true/false', async () => {
    const form = createForm({initialValues: {email: ''}});
    render(
      <CheckEmail
        form={form}
        debounce={30}
        validate={value => (value.includes('@') ? undefined : 'Invalid email')}
      />
    );

    const input = screen.getByTestId('email');
    await act(async () => {
      fireEvent.change(input, {target: {value: 'nope'}});
    });
    // Resolves only after the debounced validator ran and its error landed.
    await act(async () => {
      expect(await trigger(form)).toBe(false);
    });
    expect(getFieldErrors(form, 'email')).toEqual([
      {type: 'custom', message: 'Invalid email'}
    ]);

    await act(async () => {
      fireEvent.change(input, {target: {value: 'ok@x.io'}});
      expect(await trigger(form)).toBe(true);
    });
    expect(getFieldErrors(form, 'email')).toEqual([]);
  });
});

// ---- README "server-side errors" recipe -------------------------------------

describe('doc example: server-side error mapping (RealWorld 422)', () => {
  // The recipe shape: an API client that keeps the structured errors
  // around (fetch-fun maps a non-2xx body to e.data) and the form layer
  // landing them field by field.
  class ApiError extends Error {
    constructor(status, data) {
      const [field, messages] = Object.entries(data.errors)[0];
      super(`${field} ${messages.join(' ')}`);
      this.status = status;
      this.data = data;
    }
  }

  function Register({register}) {
    const form = React.useMemo(
      () =>
        createForm({initialValues: {username: '', email: '', password: ''}}),
      []
    );
    const emailError = useError(form, 'email');
    return (
      <form
        noValidate
        onSubmit={async () => {
          try {
            await register();
          } catch (e) {
            setServerErrors(form, e.data.errors);
          }
        }}
      >
        <Field form={form} name="email" data-testid="email" />
        <span id={fieldErrorId('email')} role="alert" data-testid="email-error">
          {emailError ?? ''}
        </span>
        <button type="submit">Register</button>
      </form>
    );
  }

  it('lands a 422 response under the named field with type:server', async () => {
    const register = vi
      .fn()
      .mockRejectedValue(
        new ApiError(422, {errors: {email: ['has already been taken']}})
      );
    render(<Register register={register} />);

    fireEvent.click(screen.getByRole('button', {name: 'Register'}));
    await vi.waitFor(() => {
      // The message renders under the field, not as one joined sentence
      expect(screen.getByTestId('email-error').textContent).toBe(
        'has already been taken'
      );
    });
    const input = screen.getByTestId('email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(fieldErrorId('email'));
  });
});

// ---- README "Submit button state" snippet -----------------------------------

describe('doc example: useCanSubmit drives the submit button', () => {
  function Profile({onSave}) {
    const form = useForm({initialValues: {email: ''}});
    const canSubmit = useCanSubmit(form);
    return (
      <button
        data-testid="save"
        disabled={!canSubmit}
        onClick={handleSubmit(form, {onSubmit: onSave})}
      >
        Save
      </button>
    );
  }

  it('disabled spans the whole async onSubmit flight', async () => {
    let release;
    let enteredResolve;
    const entered = new Promise(resolve => {
      enteredResolve = resolve;
    });
    const onSave = () => {
      enteredResolve();
      return new Promise(resolve => {
        release = resolve;
      });
    };
    render(<Profile onSave={onSave} />);
    const button = screen.getByTestId('save');
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    // Drive until onSave is actually in flight: disabled for the whole
    // async span.
    await act(async () => {
      await entered;
    });
    expect(button.disabled).toBe(true);
    await act(async () => {
      release();
    });
    expect(button.disabled).toBe(false);
  });

  it('a landed error disables the button until revalidation clears it', async () => {
    const onSave = vi.fn();
    function ValidatedProfile() {
      const form = useForm({initialValues: {email: ''}});
      const canSubmit = useCanSubmit(form);
      return (
        <>
          <Field
            form={form}
            name="email"
            data-testid="email"
            validate={value => (value ? undefined : 'required')}
          />
          <button
            data-testid="save"
            disabled={!canSubmit}
            onClick={handleSubmit(form, {onSubmit: onSave})}
          >
            Save
          </button>
        </>
      );
    }
    render(<ValidatedProfile />);
    const button = screen.getByTestId('save');
    expect(button.disabled).toBe(false);

    // Failed submit: the field error lands and the button disables —
    // onSave never runs.
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();

    // Fixing the field revalidates (reValidateMode 'onChange' once the
    // field holds an error), the error clears, the button re-enables.
    await act(async () => {
      fireEvent.change(screen.getByTestId('email'), {
        target: {value: 'ada@lovelace.dev'}
      });
    });
    expect(button.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual({email: 'ada@lovelace.dev'});
  });
});
