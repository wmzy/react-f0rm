import * as React from 'react';
import {
  getErrors,
  getValues,
  validate,
  setIsSubmitting,
  incrementSubmitCount,
  setSubmitSuccessful
} from '../form';
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
 */
interface FormProps<T extends Record<string, any> = any> extends Omit<
  React.FormHTMLAttributes<HTMLFormElement>,
  'onSubmit'
> {
  form?: Form<T>;
  initialValues?: T;
  onSubmit?: (values: T, e: React.FormEvent) => void;
  onValidSubmit?: (values: T, e: React.FormEvent) => void;
  /**
   * Called when validation fails.
   * @param errors array of {path, type, message} entries in insertion
   *        order; path is the dotted field path ('a.b', 'list.0'), type is
   *        the error kind ('custom' for plain string errors), message is
   *        the display text
   * @param values current form values
   */
  onInvalidSubmit?: (
    errors: {path: string; type: string; message: string}[],
    values: T
  ) => void;
}

export default function Form<T extends Record<string, any> = any>({
  form: f1,
  initialValues,
  onSubmit,
  onValidSubmit,
  onInvalidSubmit,
  ...props
}: FormProps<T>) {
  const f2 = useForm<T>({initialValues});
  const form = f1 || f2;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setIsSubmitting(form, true);
    incrementSubmitCount(form);
    const values = getValues(form) as T;

    if (formEl && formEl.checkValidity() === false) {
      formEl.reportValidity();
      setIsSubmitting(form, false);
      setSubmitSuccessful(form, false);
      if (onInvalidSubmit) onInvalidSubmit(getErrors(form), values);
      return;
    }

    const error = await validate(form);

    if (error) {
      setIsSubmitting(form, false);
      setSubmitSuccessful(form, false);
      if (onInvalidSubmit) onInvalidSubmit(getErrors(form), values);
      return;
    }

    try {
      if (onSubmit) await onSubmit(values, e);
      if (onValidSubmit) onValidSubmit(values, e);
      setSubmitSuccessful(form, true);
    } catch {
      setSubmitSuccessful(form, false);
    } finally {
      setIsSubmitting(form, false);
    }
  }

  return (
    <FormProvider value={form}>
      <form {...props} noValidate onSubmit={handleSubmit} />
    </FormProvider>
  );
}
