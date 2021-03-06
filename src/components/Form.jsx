import * as React from 'react';
import createForm, {
  getErrors,
  getValues,
  setDefaultValues,
  validate
} from '../form';
import {FormProvider} from '../context';

/** @typedef { import('../../index').FormProps } FormProps */

/**
 * Form
 * @param {FormProps} props
 */
export default function Form({
  form: f,
  defaultValues,
  onSubmit,
  onValidSubmit,
  onInvalidSubmit,
  ...props
}) {
  const form = React.useMemo(() => f || createForm(defaultValues), [f]);
  if (defaultValues !== undefined) setDefaultValues(form, defaultValues);

  function handleSubmit(e) {
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
      <form {...props} onSubmit={handleSubmit} />
    </FormProvider>
  );
}
