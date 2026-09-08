// Cookbook verification for docs-site/docs/guides/ui-integration.md: the
// antd/MUI/Radix/shadcn adapters render and drive form state exactly as
// documented — one runnable proof per design system. antd's responsive
// components call window.matchMedia at render; jsdom lacks it, so the
// polyfill is scoped to this file's module setup (it never leaks into the
// library or other suites).
import {describe, it, expect, beforeAll} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import React from 'react';
import {Input as AntInput} from 'antd';
import TextField from '@mui/material/TextField';
import * as Label from '@radix-ui/react-label';
import createForm, {getValues, getError} from '../src/form';
import useField from '../src/hooks/field';

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false
      }) as MediaQueryList;
  }
});

// ---- antd adapter -----------------------------------------------------------

function AntdEmailField({form}: {form: ReturnType<typeof createForm>}) {
  const {value, onChange, onBlur, disabled, error} = useField({
    form,
    name: 'email',
    validate: v => (v.includes('@') ? undefined : 'Invalid email')
  });
  return (
    <AntInput
      data-testid="email"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      status={error ? 'error' : undefined}
      aria-invalid={error ? true : undefined}
    />
  );
}

describe('ui cookbook: antd', () => {
  it('drives the controlled contract and lands the error in antd slots', () => {
    const form = createForm({initialValues: {email: ''}, mode: 'onBlur'});
    render(<AntdEmailField form={form} />);
    const input = screen.getByTestId<HTMLInputElement>('email');
    expect(input.classList.contains('ant-input')).toBe(true);

    fireEvent.change(input, {target: {value: 'nope'}});
    expect(getValues(form).email).toBe('nope');
    fireEvent.blur(input);
    expect(getError(form, 'email')?.message).toBe('Invalid email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.classList.contains('ant-input-status-error')).toBe(true);

    fireEvent.change(input, {target: {value: 'a@b.com'}});
    expect(getError(form, 'email')).toBeUndefined();
  });
});

// ---- MUI adapter ------------------------------------------------------------

function MuiEmailField({form}: {form: ReturnType<typeof createForm>}) {
  const field = useField({
    form,
    name: 'email',
    validate: v => (v.includes('@') ? undefined : 'Invalid email')
  });
  return (
    <TextField
      data-testid="email"
      label="Email"
      value={field.value ?? ''}
      onChange={e => field.onChange(e.target.value)}
      onBlur={field.onBlur}
      disabled={field.disabled}
      error={!!field.error}
      helperText={field.error}
    />
  );
}

describe('ui cookbook: MUI', () => {
  it('maps the error string onto the boolean-plus-slot convention', () => {
    const form = createForm({initialValues: {email: ''}, mode: 'onBlur'});
    render(<MuiEmailField form={form} />);
    const input = screen
      .getByTestId<HTMLInputElement>('email')
      .querySelector('input')!;

    fireEvent.change(input, {target: {value: 'x@y.com'}});
    expect(getValues(form).email).toBe('x@y.com');

    fireEvent.change(input, {target: {value: 'nope'}});
    fireEvent.blur(input);
    expect(screen.getByText('Invalid email')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});

// ---- Radix adapter ----------------------------------------------------------

function RadixEmailField({form}: {form: ReturnType<typeof createForm>}) {
  const {value, onChange, onBlur, disabled, error, focusRef} = useField({
    form,
    name: 'email'
  });
  return (
    <div>
      <Label.Root htmlFor="email-input">Email</Label.Root>
      <input
        ref={focusRef}
        id="email-input"
        data-testid="email"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
      />
      {error && <span role="alert">{error}</span>}
    </div>
  );
}

describe('ui cookbook: Radix', () => {
  it('labels and drives a Radix-primitives field', () => {
    const form = createForm({initialValues: {email: 'a@b.com'}});
    render(<RadixEmailField form={form} />);
    const input = screen.getByTestId<HTMLInputElement>('email');
    expect(screen.getByText('Email').tagName).toBe('LABEL');
    fireEvent.change(input, {target: {value: 'c@d.com'}});
    expect(getValues(form).email).toBe('c@d.com');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });
});

// ---- shadcn adapter (source-inlined, the shadcn/ui FormField shape) ---------

const cn = (...names: (string | false | undefined)[]) =>
  names.filter(Boolean).join(' ');

function ShadcnFormItem({
  label,
  error,
  children
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

function ShadcnEmailField({form}: {form: ReturnType<typeof createForm>}) {
  const {value, onChange, onBlur, disabled, error} = useField({
    form,
    name: 'email',
    validate: v => (v.includes('@') ? undefined : 'Invalid email')
  });
  return (
    <ShadcnFormItem label="Email" error={error}>
      <input
        data-testid="email"
        className={cn('border rounded px-2 py-1', error && 'border-red-500')}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
      />
    </ShadcnFormItem>
  );
}

describe('ui cookbook: shadcn', () => {
  it('renders the error in the FormItem slot and keeps the contract', () => {
    const form = createForm({initialValues: {email: ''}, mode: 'onBlur'});
    render(<ShadcnEmailField form={form} />);
    const input = screen.getByTestId<HTMLInputElement>('email');
    fireEvent.change(input, {target: {value: 'x'}});
    fireEvent.blur(input);
    expect(input.className).toContain('border-red-500');
    expect(screen.getByText('Invalid email')).toBeTruthy();
    expect(getValues(form).email).toBe('x');
  });
});
