import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import Form from '../../src/components/Form';
import {Group, Item} from '../../src/components/Checkbox';

describe('Checkbox', () => {
  it('renders a checkbox input', () => {
    render(
      <Form initialValues={{terms: []}}>
        <Group name="terms">
          <Item value="yes" data-testid="terms" />
        </Group>
      </Form>
    );
    const checkbox = screen.getByTestId('terms');
    expect(checkbox.type).toBe('checkbox');
  });

  it('toggles value on click', async () => {
    const user = userEvent.setup();
    render(
      <Form initialValues={{terms: []}}>
        <Group name="terms">
          <Item value="yes" data-testid="terms" />
        </Group>
      </Form>
    );
    const checkbox = screen.getByTestId('terms');
    expect(checkbox.checked).toBe(false);
    await user.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});
