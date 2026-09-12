import {describe, it, expect} from 'vitest';
import {
  render,
  screen,
  act,
  fireEvent,
  createEvent,
  waitFor
} from '@testing-library/react';
import React from 'react';
import Form from '../../src/components/Form';
import {Field, fieldErrorId} from '../../src/components/Field';
import ErrorSummary from '../../src/components/ErrorSummary';
import createForm, {FORM_ERROR, handleSubmit, setError} from '../../src/form';

describe('ErrorSummary', () => {
  it('renders an alert box with heading and one link per field error', async () => {
    const form = createForm({initialValues: {name: '', email: ''}});
    render(
      <Form form={form}>
        <Field name="name" />
        <Field name="email" />
        <ErrorSummary form={form} />
      </Form>
    );

    await act(async () => {
      setError(form, 'name', 'Tell us your name');
      setError(form, 'email', 'Email is invalid');
    });

    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('tabindex')).toBe('-1');
    const heading = screen.getByRole('heading', {level: 2});
    expect(heading.textContent).toBe('There is a problem');
    expect(alert.getAttribute('aria-labelledby')).toBe(heading.id);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('#' + fieldErrorId('name'));
    expect(links[0].textContent).toBe('Tell us your name');
    expect(links[1].getAttribute('href')).toBe('#' + fieldErrorId('email'));
  });

  it('renders nothing while the form has no errors', () => {
    const form = createForm({initialValues: {name: ''}});
    render(
      <Form form={form}>
        <Field name="name" />
        <ErrorSummary form={form} />
      </Form>
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('There is a problem')).toBeNull();
  });

  it('focuses the target field and prevents navigation when a link is clicked', () => {
    const form = createForm({initialValues: {name: ''}});
    render(
      <Form form={form}>
        <Field name="name" data-testid="name-input" />
        <ErrorSummary form={form} />
      </Form>
    );
    act(() => {
      setError(form, 'name', 'Tell us your name');
    });

    const link = screen.getByRole('link');
    const input = screen.getByTestId('name-input');
    const clickEvent = createEvent.click(link);
    fireEvent(link, clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('takes focus itself after a failed async submit lands errors', async () => {
    const form = createForm({initialValues: {name: ''}});
    const submit = handleSubmit(form, {
      shouldFocusError: false,
      onSubmit: async () => {
        setError(form, 'name', 'Server rejected the name');
        throw new Error('boom');
      }
    });
    render(
      <Form form={form}>
        <Field name="name" />
        <ErrorSummary form={form} />
      </Form>
    );
    expect(screen.queryByRole('alert')).toBeNull();

    await act(async () => {
      await submit();
    });

    const alert = screen.getByRole('alert');
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
    expect(screen.getByRole('link').textContent).toBe(
      'Server rejected the name'
    );
  });

  it('renders FORM_ERROR entries as plain list items without links', async () => {
    const form = createForm({initialValues: {name: ''}});
    render(
      <Form form={form}>
        <Field name="name" />
        <ErrorSummary form={form} heading="Fix these" />
      </Form>
    );

    await act(async () => {
      setError(form, FORM_ERROR, 'Something went wrong');
      setError(form, 'name', 'Tell us your name');
    });

    expect(screen.getByRole('heading', {level: 2}).textContent).toBe(
      'Fix these'
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('#' + fieldErrorId('name'));

    const formErrorText = screen.getByText('Something went wrong');
    expect(formErrorText.tagName).toBe('P');
    expect(formErrorText.closest('a')).toBeNull();
  });
});
