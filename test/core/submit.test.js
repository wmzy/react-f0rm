import {describe, it, expect, vi} from 'vitest';
import {on} from '../../src/emitter';
import createForm, {
  setIsSubmitting,
  incrementSubmitCount,
  setSubmitSuccessful,
  setDisabled,
  handleSubmit
} from '../../src/form';

describe('submission state', () => {
  it('tracks isSubmitting', () => {
    const form = createForm();
    expect(form.isSubmitting).toBe(false);
    setIsSubmitting(form, true);
    expect(form.isSubmitting).toBe(true);
    setIsSubmitting(form, false);
    expect(form.isSubmitting).toBe(false);
  });

  it('tracks submitCount', () => {
    const form = createForm();
    expect(form.submitCount).toBe(0);
    incrementSubmitCount(form);
    expect(form.submitCount).toBe(1);
    incrementSubmitCount(form);
    expect(form.submitCount).toBe(2);
  });

  it('tracks isSubmitSuccessful', () => {
    const form = createForm();
    expect(form.isSubmitSuccessful).toBeUndefined();
    setSubmitSuccessful(form, true);
    expect(form.isSubmitSuccessful).toBe(true);
    setSubmitSuccessful(form, false);
    expect(form.isSubmitSuccessful).toBe(false);
  });
});

describe('setDisabled', () => {
  it('writes the flag and emits a payload-less disabled event', () => {
    const form = createForm();
    const listener = vi.fn();
    on(form.emitter, 'disabled', listener);

    setDisabled(form, true);
    expect(form.disabled).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setDisabled(form, false);
    expect(form.disabled).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('emits on every call, like the other submission setters', () => {
    const form = createForm({disabled: true});
    const listener = vi.fn();
    on(form.emitter, 'disabled', listener);

    setDisabled(form, true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(form.disabled).toBe(true);
  });
});

describe('handleSubmit', () => {
  it('runs the full state machine without an event object', async () => {
    const form = createForm({initialValues: {name: 'test'}});
    const seen = [];
    const submit = handleSubmit(form, {
      onSubmit: values => {
        seen.push(form.isSubmitting, values);
      }
    });

    await expect(submit()).resolves.toBeUndefined();

    expect(seen).toEqual([true, {name: 'test'}]);
    expect(form.isSubmitting).toBe(false);
    expect(form.submitCount).toBe(1);
    expect(form.isSubmitSuccessful).toBe(true);
  });

  it('passes native constraint failures from currentTarget to onInvalidSubmit', async () => {
    const form = createForm({initialValues: {email: ''}});
    const onInvalidSubmit = vi.fn();
    const onValidSubmit = vi.fn();
    const reportValidity = vi.fn();
    const preventDefault = vi.fn();
    const currentTarget = {
      reportValidity,
      checkValidity: () => false,
      elements: [
        {
          name: '["email"]',
          checkValidity: () => false,
          validationMessage: 'Please fill out this field.'
        },
        {
          name: '["age"]',
          checkValidity: () => true,
          validationMessage: ''
        }
      ]
    };

    const submit = handleSubmit(form, {onValidSubmit, onInvalidSubmit});
    await submit({preventDefault, currentTarget});

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(reportValidity).toHaveBeenCalledTimes(1);
    expect(onInvalidSubmit).toHaveBeenCalledTimes(1);
    expect(onInvalidSubmit).toHaveBeenCalledWith(
      [{path: 'email', type: 'native', message: 'Please fill out this field.'}],
      {email: ''}
    );
    expect(onValidSubmit).not.toHaveBeenCalled();
    expect(form.isSubmitting).toBe(false);
    expect(form.isSubmitSuccessful).toBe(false);
    expect(form.submitCount).toBe(1);
  });

  it('skips native validation when currentTarget has no checkValidity', async () => {
    const form = createForm({initialValues: {name: 'x'}});
    const onValidSubmit = vi.fn();
    const currentTarget = {elements: []};

    const submit = handleSubmit(form, {onValidSubmit});
    await submit({currentTarget});

    expect(onValidSubmit).toHaveBeenCalledWith({name: 'x'}, expect.anything());
    expect(form.isSubmitSuccessful).toBe(true);
  });

  it('passes custom validate errors to onInvalidSubmit', async () => {
    const form = createForm({
      initialValues: {name: ''},
      validate: values => (values.name ? {} : {name: 'name required'})
    });
    const onInvalidSubmit = vi.fn();
    const onValidSubmit = vi.fn();

    const submit = handleSubmit(form, {onValidSubmit, onInvalidSubmit});
    await submit();

    expect(onInvalidSubmit).toHaveBeenCalledWith(
      [{path: 'name', type: 'custom', message: 'name required'}],
      {name: ''}
    );
    expect(onValidSubmit).not.toHaveBeenCalled();
    expect(form.isSubmitting).toBe(false);
    expect(form.isSubmitSuccessful).toBe(false);
  });

  it('swallows onSubmit errors into isSubmitSuccessful=false', async () => {
    const form = createForm();
    const onValidSubmit = vi.fn();
    const submit = handleSubmit(form, {
      onSubmit: () => {
        throw new Error('boom');
      },
      onValidSubmit
    });

    await expect(submit()).resolves.toBeUndefined();

    expect(onValidSubmit).not.toHaveBeenCalled();
    expect(form.isSubmitSuccessful).toBe(false);
    expect(form.isSubmitting).toBe(false);
  });
});
