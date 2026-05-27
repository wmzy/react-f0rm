import * as React from 'react';
import {getErrors, getValues, validate} from '../form';
import {FormProvider} from '../context';
import useForm from '../hooks/form';

/** @typedef { import('../../index').FormProps } FormProps */

/**
 * Form
 * @param {FormProps} props
 */
export default function Form({
  form: f1,
  initialValues,
  onSubmit,
  onValidSubmit,
  onInvalidSubmit,
  ...props
}) {
  const f2 = useForm({initialValues});
  const form = f1 || f2;

  async function handleSubmit(e) {
    e.preventDefault();
    const error = await validate(form);

    const values = getValues(form);

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
