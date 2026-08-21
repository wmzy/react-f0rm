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

  it('passes native constraint failures to onInvalidSubmit with dotted paths', async () => {
    const onInvalidSubmit = vi.fn();
    const onValidSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form
        initialValues={{email: ''}}
        onValidSubmit={onValidSubmit}
        onInvalidSubmit={onInvalidSubmit}
      >
        <Field name="email" required />
        <button type="submit">Submit</button>
      </Form>
    );

    await user.click(screen.getByRole('button', {name: 'Submit'}));
    await vi.waitFor(() => {
      expect(onInvalidSubmit).toHaveBeenCalledTimes(1);
    });
    const errors = onInvalidSubmit.mock.calls[0][0];
    expect(errors).toEqual([
      {path: 'email', type: 'native', message: expect.any(String)}
    ]);
    expect(errors[0].message).not.toBe('');
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

  it('syncs the values prop into fields when its reference changes', async () => {
    const user = userEvent.setup();
    const valuesA = {name: 'a'};

    const {rerender} = render(
      <Form values={valuesA}>
        <Field name="name" />
      </Form>
    );
    const input = screen.getByDisplayValue('a');

    // User typing survives a re-render passing the same reference.
    await user.type(input, '!');
    rerender(
      <Form values={valuesA}>
        <Field name="name" />
      </Form>
    );
    expect(screen.getByDisplayValue('a!')).toBeDefined();

    // A new reference replaces the uncommitted draft (master-detail).
    rerender(
      <Form values={{name: 'b'}}>
        <Field name="name" />
      </Form>
    );
    expect(screen.getByDisplayValue('b')).toBeDefined();
  });

  it('focuses the first errored field when submit fails custom validation', async () => {
    const user = userEvent.setup();

    render(
      <Form initialValues={{name: '', email: ''}}>
        <Field name="name" validate={() => 'name required'} />
        <Field name="email" validate={() => 'email invalid'} />
        <button type="submit">Submit</button>
      </Form>
    );

    const [nameInput, emailInput] = screen.getAllByRole('textbox');
    await user.click(screen.getByRole('button', {name: 'Submit'}));
    await vi.waitFor(() => {
      // First error in insertion (mount) order gets the focus.
      expect(document.activeElement).toBe(nameInput);
      expect(document.activeElement).not.toBe(emailInput);
    });
  });

  it('does not focus the errored field when shouldFocusError is false', async () => {
    const onInvalidSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form
        initialValues={{name: ''}}
        onInvalidSubmit={onInvalidSubmit}
        shouldFocusError={false}
      >
        <Field name="name" validate={() => 'name required'} />
        <button type="submit">Submit</button>
      </Form>
    );

    const [nameInput] = screen.getAllByRole('textbox');
    await user.click(screen.getByRole('button', {name: 'Submit'}));
    // Confirm validation actually failed before asserting no focus move.
    await vi.waitFor(() => {
      expect(onInvalidSubmit).toHaveBeenCalledTimes(1);
    });
    expect(document.activeElement).not.toBe(nameInput);
  });

  it('focuses the first :invalid control when native constraints fail', async () => {
    const user = userEvent.setup();

    render(
      <Form initialValues={{email: ''}}>
        <Field name="email" required />
        <button type="submit">Submit</button>
      </Form>
    );

    const [emailInput] = screen.getAllByRole('textbox');
    await user.click(screen.getByRole('button', {name: 'Submit'}));
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(emailInput);
    });
  });
});
