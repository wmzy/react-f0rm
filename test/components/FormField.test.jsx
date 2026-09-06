import {describe, it, expect} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';
import React from 'react';
import Form from '../../src/components/Form';
import FormField from '../../src/components/FormField';
import {fieldErrorId} from '../../src/components/Field';
import createForm, {getValue, setError} from '../../src/form';

describe('FormField', () => {
  it('renders through the render prop with the bound field result', () => {
    render(
      <Form initialValues={{name: 'ada'}}>
        <FormField name="name">
          {field => (
            <input
              aria-label="name"
              value={field.value}
              onChange={e => field.onChange(e.target.value)}
            />
          )}
        </FormField>
      </Form>
    );
    const input = screen.getByLabelText('name');
    expect(input.value).toBe('ada');

    fireEvent.change(input, {target: {value: 'grace'}});
    expect(input.value).toBe('grace');
  });

  it('resolves the form from the context and updates the store on change', () => {
    const form = createForm({initialValues: {name: 'ada'}});
    render(
      <Form form={form}>
        <FormField name="name">
          {field => (
            <input
              aria-label="name"
              value={field.value}
              onChange={e => field.onChange(e.target.value)}
            />
          )}
        </FormField>
      </Form>
    );
    fireEvent.change(screen.getByLabelText('name'), {target: {value: 'grace'}});
    expect(getValue(form, 'name')).toBe('grace');
  });

  it('exposes errors and re-renders through the subscription', () => {
    const form = createForm({initialValues: {name: 'ada'}});
    render(
      <Form form={form}>
        <FormField name="name">
          {field => (
            <span aria-label="name-error">{field.error ?? 'clean'}</span>
          )}
        </FormField>
      </Form>
    );
    expect(screen.getByLabelText('name-error').textContent).toBe('clean');
    act(() => setError(form, 'name', 'oops'));
    expect(screen.getByLabelText('name-error').textContent).toBe('oops');
  });

  it('accepts an explicit form without a provider', () => {
    const form = createForm({initialValues: {a: 'x'}});
    render(
      <FormField form={form} name="a">
        {field => (
          <input aria-label="a" value={field.value} onChange={() => {}} />
        )}
      </FormField>
    );
    expect(screen.getByLabelText('a').value).toBe('x');
  });

  it('focusRef completes the fieldErrorId aria chain', () => {
    const form = createForm({initialValues: {a: 'x'}});
    render(
      <Form form={form}>
        <FormField name="a">
          {field => (
            <>
              <input
                aria-label="a"
                ref={field.focusRef}
                onChange={() => {}}
                value={field.value}
              />
              <span id={fieldErrorId('a')} role="alert" aria-label="a-err">
                {field.error}
              </span>
            </>
          )}
        </FormField>
      </Form>
    );
    act(() => setError(form, 'a', 'bad'));
    expect(screen.getByLabelText('a-err').textContent).toBe('bad');
  });
});
