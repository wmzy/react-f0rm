import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import Form from '../../src/components/Form';
import {Field} from '../../src/components/Field';

describe('Field', () => {
  it('renders an input with value', () => {
    render(
      <Form initialValues={{name: 'test'}}>
        <Field name="name" />
      </Form>
    );
    const input = screen.getByDisplayValue('test');
    expect(input).toBeDefined();
  });

  it('updates value on change', async () => {
    const user = userEvent.setup();
    render(
      <Form initialValues={{name: ''}}>
        <Field name="name" data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    await user.type(input, 'hello');
    expect(input.value).toBe('hello');
  });

  it('renders with custom component via as prop', () => {
    function CustomInput({value, onChange, ...props}) {
      return <textarea {...props} value={value} onChange={e => onChange(e.target.value)} />;
    }
    render(
      <Form initialValues={{bio: 'hello'}}>
        <Field name="bio" as={CustomInput} />
      </Form>
    );
    expect(screen.getByDisplayValue('hello')).toBeDefined();
  });
});
