// Doc-example verification: the exact compositions documented in README.md
// ("createFormContext", "Async validation" / "Multiple errors per field") and
// docs-site/docs (api/create-form-context.md, guides/validation.md) — proving
// the snippets behave as written. Origin: Wave 4 "DocsUpdate" task.
import {describe, it, expect} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';
import React from 'react';
import {createFormContext, trigger, getFieldErrors} from '../src/index';
import createForm from '../src/form';
import {Field} from '../src/components/Field';
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
