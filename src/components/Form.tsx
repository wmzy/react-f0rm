import * as React from 'react';
import {getErrors, getValues, validate} from '../form';
import type {Form} from '../form';
import {FormProvider} from '../context';
import useForm from '../hooks/form';

interface FormProps<T extends Record<string, any> = any>
  extends React.FormHTMLAttributes<HTMLFormElement> {
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
    const error = await validate(form);

    const values = getValues(form) as T;

    if (error) {
      if (onInvalidSubmit) onInvalidSubmit(getErrors(form), values);
      return;
    }

    if (onSubmit) onSubmit(values, e);
    if (onValidSubmit) onValidSubmit(values, e);
  }

  return (
    <FormProvider value={form}>
      <form {...props} noValidate onSubmit={handleSubmit} />
    </FormProvider>
  );
}
