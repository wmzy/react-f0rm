import {describe, it, expect, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import Form from '../../src/components/Form';
import {Group, Item} from '../../src/components/Checkbox';
import createForm, {setError, getValues} from '../../src/form';

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

  it('attaches aria-invalid on items when the group has an error', async () => {
    const form = createForm({initialValues: {terms: []}});
    render(
      <Form form={form}>
        <Group name="terms">
          <Item value="yes" data-testid="terms" />
        </Group>
      </Form>
    );
    const checkbox = screen.getByTestId('terms');
    expect(checkbox.getAttribute('aria-invalid')).toBeNull();
    await act(async () => {
      setError(form, 'terms', 'pick at least one');
    });
    await vi.waitFor(() => {
      expect(checkbox.getAttribute('aria-invalid')).toBe('true');
    });
  });

  it('removes the value when a checked item is unchecked', async () => {
    const user = userEvent.setup();
    const form = createForm({initialValues: {terms: ['yes']}});
    render(
      <Form form={form}>
        <Group name="terms">
          <Item value="yes" data-testid="terms" />
        </Group>
      </Form>
    );
    expect(screen.getByTestId('terms').checked).toBe(true);

    await user.click(screen.getByTestId('terms'));
    expect(screen.getByTestId('terms').checked).toBe(false);
    expect(getValues(form)).toEqual({terms: []});
  });

  it('throws when an Item renders outside a Group', () => {
    expect(() => render(<Item value="yes" />)).toThrow('no group provided');
  });
});
