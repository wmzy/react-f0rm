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

  function handleSubmit(e) {
    e.preventDefault();
    const task = validate(form);

    if (!(onSubmit || onValidSubmit || onInvalidSubmit)) return;

    const values = getValues(form);
    if (onSubmit) onSubmit(values, e);
    task.then(valid =>
      valid
        ? onValidSubmit && onValidSubmit(values, e)
        : onInvalidSubmit && onInvalidSubmit(getErrors(form), values)
    );
  }

  return (
    <FormProvider value={form}>
      <form {...props} noValidate onSubmit={handleSubmit} />
    </FormProvider>
  );
}
