import * as React from 'react';
import {getErrors, getValues, validate, setIsSubmitting, incrementSubmitCount, setSubmitSuccessful} from '../form';
import type {Form} from '../form';
import {FormProvider} from '../context';
import useForm from '../hooks/form';

interface FormProps<T extends Record<string, any> = any>
  extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  form?: Form<T>;
  initialValues?: T;
  onSubmit?: (values: T, e: React.FormEvent) => void;
  onValidSubmit?: (values: T, e: React.FormEvent) => void;
  onInvalidSubmit?: (errors: string[], values: T) => void;
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
    setIsSubmitting(form, true);
    incrementSubmitCount(form);

    const error = await validate(form);
    const values = getValues(form) as T;

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
