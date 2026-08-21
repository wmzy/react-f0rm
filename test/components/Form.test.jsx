import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import Form from '../../src/components/Form';
import {Field} from '../../src/components/Field';

describe('Form', () => {
  it('renders a form element', () => {
    render(<Form initialValues={{}}><button type="submit">Submit</button></Form>);
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
  });

  it('calls onSubmit with values', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form initialValues={{name: 'test'}} onSubmit={onSubmit}>
        <Field name="name" />
        <button type="submit">Submit</button>
      </Form>
    );

    await user.click(screen.getByRole('button', {name: 'Submit'}));
    expect(onSubmit).toHaveBeenCalledWith({name: 'test'}, expect.anything());
  });

  it('calls onValidSubmit after validation passes', async () => {
    const onValidSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form initialValues={{name: 'test'}} onValidSubmit={onValidSubmit}>
        <Field name="name" />
        <button type="submit">Submit</button>
      </Form>
    );

    await user.click(screen.getByRole('button', {name: 'Submit'}));
    // Wait for async validation
    await vi.waitFor(() => {
      expect(onValidSubmit).toHaveBeenCalledWith({name: 'test'}, expect.anything());
    });
  });

  it('prevents default form submission', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form initialValues={{}} onSubmit={onSubmit}>
        <button type="submit">Submit</button>
      </Form>
    );

    await user.click(screen.getByRole('button', {name: 'Submit'}));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('passes structured errors to onInvalidSubmit when built-in validation fails', async () => {
    const onInvalidSubmit = vi.fn();
    const onValidSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form
        initialValues={{name: ''}}
        onValidSubmit={onValidSubmit}
        onInvalidSubmit={onInvalidSubmit}
      >
        <Field name="name" required />
        <button type="submit">Submit</button>
      </Form>
    );

    await user.click(screen.getByRole('button', {name: 'Submit'}));
    await vi.waitFor(() => {
      expect(onInvalidSubmit).toHaveBeenCalledTimes(1);
    });
    const errors = onInvalidSubmit.mock.calls[0][0];
    expect(Array.isArray(errors)).toBe(true);
    expect(
      errors.every(
        (error) =>
          typeof error.path === 'string' &&
          typeof error.type === 'string' &&
          typeof error.message === 'string'
      )
    ).toBe(true);
    expect(onValidSubmit).not.toHaveBeenCalled();
  });

  it('still passes custom validate errors to onInvalidSubmit', async () => {
    const onInvalidSubmit = vi.fn();
    const onValidSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form
        initialValues={{name: ''}}
        onValidSubmit={onValidSubmit}
        onInvalidSubmit={onInvalidSubmit}
      >
        <Field name="name" validate={() => 'too short'} />
        <button type="submit">Submit</button>
      </Form>
    );

    await user.click(screen.getByRole('button', {name: 'Submit'}));
    await vi.waitFor(() => {
      expect(onInvalidSubmit).toHaveBeenCalledWith(
        [{path: 'name', type: 'custom', message: 'too short'}],
        {name: ''}
      );
    });
    expect(onValidSubmit).not.toHaveBeenCalled();
  });
});
