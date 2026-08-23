// Tests for the <Devtools> panel shipped from the `react-f0rm/devtools`
// entry (src/devtools/*). New component, so per-component convention it
// gets its own file rather than appending to an existing suite.
import {describe, it, expect, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import createForm, {setValue, setError, setTouched} from '../../src/form';
import {FormProvider} from '../../src/context';
import {Devtools} from '../../src/devtools';

function renderDevtools(form) {
  return render(
    <FormProvider value={form}>
      <Devtools />
    </FormProvider>
  );
}

describe('Devtools', () => {
  it('renders tabs with values and errors counts', () => {
    const form = createForm({
      initialValues: {name: 'a', profile: {age: 3}}
    });
    renderDevtools(form);

    // Two primitive leaves: name + profile.age.
    expect(screen.getByRole('tab', {name: /values/i}).textContent).toMatch(/2/);
    expect(screen.getByRole('tab', {name: /errors/i}).textContent).toMatch(/0/);
    expect(screen.getByText('"a"')).toBeTruthy();
  });

  it('updates values live when the form changes', () => {
    const form = createForm({initialValues: {name: 'a'}});
    renderDevtools(form);

    act(() => setValue(form, 'name', 'changed'));
    expect(screen.getByText('"changed"')).toBeTruthy();
    expect(screen.queryByText('"a"')).not.toBeTruthy();
  });

  it('resets the form through the Reset button', async () => {
    const user = userEvent.setup();
    const form = createForm({initialValues: {name: 'a'}});
    renderDevtools(form);

    act(() => setValue(form, 'name', 'changed'));
    await user.click(screen.getByRole('button', {name: 'Reset'}));
    expect(screen.getByText('"a"')).toBeTruthy();
  });

  it('runs every registered validator through the Validate button', async () => {
    const user = userEvent.setup();
    const form = createForm({initialValues: {name: ''}});
    const validator = vi.fn();
    form.validators.set('["name"]', validator);
    renderDevtools(form);

    await user.click(screen.getByRole('button', {name: 'Validate'}));
    expect(validator).toHaveBeenCalledTimes(1);
  });

  it('throws when rendered with no form and no provider', () => {
    expect(() => render(<Devtools />)).toThrow(/form/i);
  });

  it('switches tabs to inspect errors and touched fields', async () => {
    const user = userEvent.setup();
    const form = createForm({initialValues: {name: ''}});
    renderDevtools(form);

    act(() => {
      setError(form, 'name', 'required');
      setTouched(form, 'name');
    });

    const errorsTab = screen.getByRole('tab', {name: /errors/i});
    expect(errorsTab.textContent).toMatch(/1/);
    await user.click(errorsTab);
    expect(screen.getByText('name')).toBeTruthy();
    expect(screen.getByText('required')).toBeTruthy();

    await user.click(screen.getByRole('tab', {name: /touched/i}));
    expect(screen.getByText('name')).toBeTruthy();
  });

  it('renders every error of a field holding several', async () => {
    const user = userEvent.setup();
    const form = createForm({initialValues: {name: ''}});
    renderDevtools(form);

    act(() => setError(form, 'name', ['required', 'too short']));

    // Both errors count towards the tab badge...
    const errorsTab = screen.getByRole('tab', {name: /errors/i});
    expect(errorsTab.textContent).toMatch(/2/);
    // ...and both render as separate rows in the panel.
    await user.click(errorsTab);
    expect(screen.getByText('required')).toBeTruthy();
    expect(screen.getByText('too short')).toBeTruthy();
    expect(screen.getAllByText('name').length).toBe(2);
  });

  it('collapses to a badge and expands back', async () => {
    const user = userEvent.setup();
    const form = createForm({initialValues: {name: 'a'}});
    renderDevtools(form);

    await user.click(screen.getByRole('button', {name: /collapse/i}));
    expect(
      screen.getByRole('button', {name: /open react-f0rm devtools/i})
    ).toBeTruthy();

    await user.click(
      screen.getByRole('button', {name: /open react-f0rm devtools/i})
    );
    expect(screen.getByRole('tab', {name: /values/i})).toBeTruthy();
  });
});
