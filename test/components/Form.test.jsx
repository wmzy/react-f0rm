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
});
