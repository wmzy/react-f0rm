import * as React from 'react';
import type {StoryObj, Meta} from '@storybook/react-vite';

import TextField from '@mui/material/TextField';
import {Input} from 'antd';
import * as Label from '@radix-ui/react-label';
import {createForm, useField} from '../src';
import type {FormInstance} from '../src';

// Renders the four design-system adapters from
// docs-site/docs/guides/ui-integration.md exactly as the cookbook writes
// them (test/ui-integration.test.tsx asserts the same adapters' state
// flows), so the pattern is browsable in Storybook alongside the docs.
// Each adapter receives the form instance directly — no Provider involved.

type EmailValues = {email: string};

const meta = {
  title: 'ReactF0rm/UI Integration'
} satisfies Meta;

export default meta;

// ---- MUI adapter ------------------------------------------------------------

function MuiEmailField({form}: {form: FormInstance<EmailValues>}) {
  const field = useField({
    form,
    name: 'email',
    validate: v => (v.includes('@') ? undefined : 'Invalid email')
  });
  return (
    <TextField
      label="Email"
      value={field.value ?? ''}
      onChange={e => field.onChange(e.target.value)} // MUI forwards the event
      onBlur={field.onBlur}
      disabled={field.disabled}
      error={!!field.error} // boolean flag instead of the message
      helperText={field.error} // the message rides in helperText
    />
  );
}

export const Mui: StoryObj = {
  render: () => {
    const form = createForm({initialValues: {email: ''}});
    return <MuiEmailField form={form} />;
  }
};

// ---- antd adapter -----------------------------------------------------------

function AntdEmailField({form}: {form: FormInstance<EmailValues>}) {
  const {value, onChange, onBlur, disabled, error} = useField({
    form,
    name: 'email',
    validate: v => (v.includes('@') ? undefined : 'Invalid email')
  });
  return (
    <Input
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      status={error ? 'error' : undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? 'email-error' : undefined}
    />
  );
}

export const Antd: StoryObj = {
  render: () => {
    const form = createForm({initialValues: {email: ''}});
    return <AntdEmailField form={form} />;
  }
};

// ---- Radix adapter ----------------------------------------------------------

function RadixEmailField({form}: {form: FormInstance<EmailValues>}) {
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

export const Radix: StoryObj = {
  render: () => {
    const form = createForm({initialValues: {email: ''}});
    return <RadixEmailField form={form} />;
  }
};

// ---- shadcn adapter (source-inlined, the shadcn/ui FormField shape) ---------

const cn = (...names: (string | false | undefined)[]) =>
  names.filter(Boolean).join(' ');

function ShadcnFormItem({
  label,
  error,
  children
}: {
  label: string;
  error: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label>{label}</label>
      {children}
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}

function ShadcnEmailField({form}: {form: FormInstance<EmailValues>}) {
  const {value, onChange, onBlur, disabled, error} = useField({
    form,
    name: 'email',
    validate: v => (v.includes('@') ? undefined : 'Invalid email')
  });
  return (
    <ShadcnFormItem label="Email" error={error}>
      <input
        className={cn('border rounded px-2 py-1', error && 'border-red-500')}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
      />
    </ShadcnFormItem>
  );
}

export const Shadcn: StoryObj = {
  render: () => {
    const form = createForm({initialValues: {email: ''}});
    return <ShadcnEmailField form={form} />;
  }
};

// ---- the generic ControlField pattern ---------------------------------------

function ControlField({
  form,
  name,
  control: Control,
  ...rest
}: {
  form: FormInstance<{bio: string}>;
  name: string;
  control: React.ComponentType<Record<string, any>>;
}) {
  const {value, onChange, onBlur, disabled, error} = useField({form, name});
  return (
    <div className="field">
      <Control
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        {...rest}
      />
      {error && <span role="alert">{error}</span>}
    </div>
  );
}

export const GenericControl: StoryObj = {
  render: () => {
    const form = createForm({initialValues: {bio: ''}});
    return (
      <ControlField
        form={form}
        name="bio"
        control={props => <textarea rows={3} {...props} />}
        maxLength={200}
      />
    );
  }
};
