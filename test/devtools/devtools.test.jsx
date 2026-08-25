// Tests for the <Devtools> panel shipped from the `react-f0rm/devtools`
// entry (src/devtools/*). New component, so per-component convention it
// gets its own file rather than appending to an existing suite.
import {describe, it, expect, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import createForm, {
  setValue,
  setError,
  setTouched,
  handleSubmit
} from '../../src/form';
import {FormProvider} from '../../src/context';
import {Devtools} from '../../src/devtools';
import {injectDevtoolsStyles} from '../../src/devtools/styles';

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

  it('reads the form from the form prop without a provider and honors position', () => {
    const form = createForm({initialValues: {name: 'a'}});
    render(<Devtools form={form} position="bottom-left" />);
    expect(screen.getByText('"a"')).toBeTruthy();
    expect(document.querySelector('section.rf0-dt--bottom-left')).toBeTruthy();
  });

  it('flags the collapsed badge with the error dot while errors exist', async () => {
    const user = userEvent.setup();
    const form = createForm({initialValues: {name: ''}});
    renderDevtools(form);

    await user.click(screen.getByRole('button', {name: /collapse/i}));
    const badge = screen.getByRole('button', {
      name: /open react-f0rm devtools/i
    });
    expect(badge.className).not.toMatch(/rf0-dt-badge--has-errors/);

    // The collapsed badge still tracks live error state.
    act(() => setError(form, 'name', 'required'));
    expect(badge.className).toMatch(/rf0-dt-badge--has-errors/);
    expect(badge.getAttribute('aria-label')).toMatch(/1 error/);
  });

  it('reflects the submit lifecycle in the status strip', async () => {
    const form = createForm({initialValues: {name: ''}});
    renderDevtools(form);
    // Text inside each status chip is split across text nodes and <b>, so
    // match spans by their full textContent.
    const chip = text =>
      screen.getByText(
        (_, el) => el?.tagName === 'SPAN' && el.textContent === text
      );

    // Unknown before any submit.
    expect(chip('ok –')).toBeTruthy();

    // submitting flips on during the flight, with the highlight class.
    let release;
    const gate = new Promise(resolve => {
      release = resolve;
    });
    let flight;
    act(() => {
      flight = handleSubmit(form, {onSubmit: () => gate})();
    });
    expect(chip('submitting true').className).toMatch('rf0-dt-on');

    await act(async () => {
      release();
      await flight;
    });
    expect(chip('submits 1')).toBeTruthy();
    expect(chip('ok true').className).toMatch('rf0-dt-ok');
  });

  it('marks ok false with the error class after a failed submit', async () => {
    const form = createForm({
      initialValues: {name: ''},
      validate: () => ({name: 'required'})
    });
    renderDevtools(form);
    const chip = text =>
      screen.getByText(
        (_, el) => el?.tagName === 'SPAN' && el.textContent === text
      );

    await act(async () => {
      await handleSubmit(form, {})();
    });
    expect(chip('ok false').className).toMatch('rf0-dt-err');
  });

  it('moves between tabs with arrow keys, wraps, and ignores other keys', async () => {
    const user = userEvent.setup();
    renderDevtools(createForm({initialValues: {}}));

    const valuesTab = screen.getByRole('tab', {name: /values/i});
    valuesTab.focus();
    await user.keyboard('{ArrowRight}');
    const errorsTab = screen.getByRole('tab', {name: /errors/i});
    expect(errorsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(errorsTab);

    await user.keyboard('{ArrowLeft}');
    expect(valuesTab.getAttribute('aria-selected')).toBe('true');

    // ArrowLeft from the first tab wraps around to the last one.
    await user.keyboard('{ArrowLeft}');
    const dirtyTab = screen.getByRole('tab', {name: /dirty/i});
    expect(dirtyTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(dirtyTab);

    // Non-arrow keys leave the selection alone.
    await user.keyboard('x');
    expect(dirtyTab.getAttribute('aria-selected')).toBe('true');
  });

  it('shows empty-state placeholders on the errors, touched and dirty tabs', async () => {
    const user = userEvent.setup();
    renderDevtools(createForm({initialValues: {}}));

    await user.click(screen.getByRole('tab', {name: /errors/i}));
    expect(screen.getByText('no errors')).toBeTruthy();
    await user.click(screen.getByRole('tab', {name: /touched/i}));
    expect(screen.getByText('no touched fields')).toBeTruthy();
    await user.click(screen.getByRole('tab', {name: /dirty/i}));
    expect(screen.getByText('no dirty fields')).toBeTruthy();
  });

  it('lists dirty fields after edits', async () => {
    const user = userEvent.setup();
    const form = createForm({initialValues: {name: 'a'}});
    renderDevtools(form);

    act(() => setValue(form, 'name', 'changed'));
    await user.click(screen.getByRole('tab', {name: /dirty/i}));
    expect(screen.getByText('name')).toBeTruthy();
    expect(screen.getByText('changed')).toBeTruthy();
  });

  it('starts deep containers collapsed with a summary and expands on toggle', async () => {
    const user = userEvent.setup();
    const form = createForm({
      initialValues: {a: {b: {c: 1}}, wrap: {inner: [1, 2]}}
    });
    renderDevtools(form);

    // Depth-2 containers render closed: object '{…} 1', array '[…] 2'.
    expect(screen.getByText('{…} 1')).toBeTruthy();
    expect(screen.getByText('[…] 2')).toBeTruthy();
    // The caret/summary live in spans inside the toggle button, so locate
    // the button from its summary text instead of the accessible name.
    const row = text =>
      screen.getByText(
        (_, el) => el?.className === 'rf0-dt-row' && el.textContent === text
      );
    expect(() => row('c: 1')).toThrow();

    await user.click(screen.getByText('{…} 1').closest('button'));
    expect(row('c: 1')).toBeTruthy();
    expect(screen.queryByText('{…} 1')).not.toBeTruthy();

    // Collapsing again hides the children and restores the summary.
    await user.click(screen.getByText('b').closest('button'));
    expect(screen.getByText('{…} 1')).toBeTruthy();
    expect(() => row('c: 1')).toThrow();
  });

  it('renders arrays with index labels and every primitive kind', () => {
    const form = createForm({
      initialValues: {list: [1, 'two'], flag: true, nick: null}
    });
    renderDevtools(form);
    act(() => setValue(form, 'gone', undefined));
    const row = text =>
      screen.getByText(
        (_, el) => el?.className === 'rf0-dt-row' && el.textContent === text
      );

    expect(row('0: 1')).toBeTruthy();
    expect(row('1: "two"')).toBeTruthy();
    expect(row('flag: true')).toBeTruthy();
    expect(row('nick: null')).toBeTruthy();
    expect(row('gone: undefined')).toBeTruthy();
  });

  it('injects the stylesheet idempotently', () => {
    injectDevtoolsStyles();
    injectDevtoolsStyles();
    expect(
      document.querySelectorAll('#react-f0rm-devtools-style')
    ).toHaveLength(1);
  });

  it('no-ops outside a DOM environment', () => {
    vi.stubGlobal('document', undefined);
    try {
      expect(() => injectDevtoolsStyles()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
