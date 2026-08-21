import {describe, it, expect, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import Form from '../../src/components/Form';
import {Group, Item} from '../../src/components/Radio';
import createForm, {setError} from '../../src/form';

describe('Radio', () => {
  it('renders radio inputs', () => {
    render(
      <Form initialValues={{color: ['red']}}>
        <Group name="color">
          <Item value="red" data-testid="red" />
          <Item value="blue" data-testid="blue" />
        </Group>
      </Form>
    );
    expect(screen.getByTestId('red').type).toBe('radio');
    expect(screen.getByTestId('blue').type).toBe('radio');
  });

  it('checks the initially selected value', () => {
    render(
      <Form initialValues={{color: ['red']}}>
        <Group name="color">
          <Item value="red" data-testid="red" />
          <Item value="blue" data-testid="blue" />
        </Group>
      </Form>
    );
    expect(screen.getByTestId('red').checked).toBe(true);
    expect(screen.getByTestId('blue').checked).toBe(false);
  });

  it('toggles a single radio on click', async () => {
    const user = userEvent.setup();
    render(
      <Form initialValues={{agree: []}}>
        <Group name="agree">
          <Item value="yes" data-testid="agree" />
        </Group>
      </Form>
    );
    expect(screen.getByTestId('agree').checked).toBe(false);
    await user.click(screen.getByTestId('agree'));
    expect(screen.getByTestId('agree').checked).toBe(true);
  });

  it('attaches aria-invalid on items when the group has an error', async () => {
    const form = createForm({initialValues: {color: ''}});
    render(
      <Form form={form}>
        <Group name="color">
          <Item value="red" data-testid="red" />
        </Group>
      </Form>
    );
    const radio = screen.getByTestId('red');
    expect(radio.getAttribute('aria-invalid')).toBeNull();
    await act(async () => {
      setError(form, 'color', 'pick one');
    });
    await vi.waitFor(() => {
      expect(radio.getAttribute('aria-invalid')).toBe('true');
    });
  });
});
