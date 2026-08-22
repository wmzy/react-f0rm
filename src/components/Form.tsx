import * as React from 'react';
import {handleSubmit} from '../form';
import type {Form} from '../form';
import {FormProvider} from '../context';
import useForm from '../hooks/form';

/**
 * Props for <Form>.
 *
 * Native validation behavior: the rendered <form> always sets noValidate,
 * which suppresses the browser's built-in blocked-submit UI. However, native
 * constraint validation still gates submission — the form element's
 * checkValidity() runs before custom validators, and when it fails,
 * reportValidity() surfaces the offending constraints as native bubbles and
 * submission stops (onInvalidSubmit fires). onSubmit/onValidSubmit only run
 * once every native constraint (required, type=email, minLength, ...) passes.
 *
 * The submit flow itself lives in the headless `handleSubmit` (see form.ts);
 * this component is a thin wrapper that binds it to the rendered <form>.
 */
interface FormProps<T extends Record<string, any> = any> extends Omit<
  React.FormHTMLAttributes<HTMLFormElement>,
  'onSubmit'
> {
  form?: Form<T>;
  initialValues?: T;
  /**
   * Controlled external values. When the `values` reference changes, the
   * new object is synced into the form (via setInitialValues semantics):
   * uncommitted user edits are discarded -- master-detail semantics, where
   * selecting another record replaces the draft -- while touched flags and
   * errors are kept. Sync is reference-based: re-renders that pass the same
   * `values` reference never clobber what the user is typing.
   */
  values?: T;
  onSubmit?: (values: T, e: React.FormEvent) => void;
  onValidSubmit?: (values: T, e: React.FormEvent) => void;
  /**
   * Called when validation fails.
   * @param errors array of {path, type, message} entries in insertion
   *        order; path is the dotted field path ('a.b', 'list.0'), type is
   *        the error kind ('custom' for plain string errors, 'native' for
   *        failed DOM constraint validation), message is the display text
   * @param values current form values
   */
  onInvalidSubmit?: (
    errors: {path: string; type: string; message: string}[],
    values: T
  ) => void;
  /**
   * Focus the first field with an error after a failed submit: custom
   * validation failures focus the first errored field, native constraint
   * failures focus the first ':invalid' control. Defaults to true; pass
   * false to disable.
   */
  shouldFocusError?: boolean;
}

export default function Form<T extends Record<string, any> = any>({
  form: f1,
  initialValues,
  values,
  onSubmit,
  onValidSubmit,
  onInvalidSubmit,
  shouldFocusError,
  ...props
}: FormProps<T>) {
  const f2 = useForm<T>({initialValues, values});
  const form = f1 || f2;

  const submit = handleSubmit(form, {
    onSubmit,
    onValidSubmit,
    onInvalidSubmit,
    shouldFocusError
  });

  return (
    <FormProvider value={form}>
      <form {...props} noValidate onSubmit={submit} />
    </FormProvider>
  );
}
