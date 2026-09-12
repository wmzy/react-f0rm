import {describe, it, expect, vi} from 'vitest';
import {on} from '../../src/emitter';
import createForm, {
  setIsSubmitting,
  incrementSubmitCount,
  setSubmitSuccessful,
  setDisabled,
  setServerErrors,
  setError,
  getError,
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

  it('skips the native gate per submit with shouldUseNativeValidation: false', async () => {
    const form = createForm({initialValues: {email: 'a@b.c'}});
    const onValidSubmit = vi.fn();
    const checkValidity = vi.fn(() => false);
    const reportValidity = vi.fn();
    const currentTarget = {checkValidity, reportValidity, elements: []};

    const submit = handleSubmit(form, {
      onValidSubmit,
      shouldUseNativeValidation: false
    });
    await submit({currentTarget});

    // The gate never consulted the DOM: custom validation ran and the
    // submit succeeded despite the element reporting invalid.
    expect(checkValidity).not.toHaveBeenCalled();
    expect(reportValidity).not.toHaveBeenCalled();
    expect(onValidSubmit).toHaveBeenCalledWith(
      {email: 'a@b.c'},
      expect.anything()
    );
    expect(form.isSubmitSuccessful).toBe(true);
  });

  it('form-level shouldUseNativeValidation: false skips the gate; a per-submit true reinstates it', async () => {
    const form = createForm({
      initialValues: {email: ''},
      shouldUseNativeValidation: false
    });
    const onValidSubmit = vi.fn();
    const onInvalidSubmit = vi.fn();
    const checkValidity = vi.fn(() => false);
    const currentTarget = {
      checkValidity,
      reportValidity: () => {},
      elements: []
    };

    // Form flag false: the gate is skipped and custom validation runs.
    await handleSubmit(form, {onValidSubmit})({currentTarget});
    expect(checkValidity).not.toHaveBeenCalled();
    expect(onValidSubmit).toHaveBeenCalledTimes(1);

    // Per-submit override reinstates the gate for this attempt only.
    await handleSubmit(form, {
      onValidSubmit,
      onInvalidSubmit,
      shouldUseNativeValidation: true
    })({currentTarget});
    expect(checkValidity).toHaveBeenCalledTimes(1);
    expect(onInvalidSubmit).toHaveBeenCalledTimes(1);
    expect(form.isSubmitSuccessful).toBe(false);
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

  it('ignores attempts while a submit is in flight', async () => {
    const form = createForm({initialValues: {name: 'x'}});
    let resolveFlight;
    let signalStarted;
    const started = new Promise(resolve => {
      signalStarted = resolve;
    });
    const onSubmit = vi.fn(() => {
      signalStarted();
      return new Promise(resolve => {
        resolveFlight = resolve;
      });
    });
    const submit = handleSubmit(form, {onSubmit});

    const first = submit();
    // Synchronous double-fire lands while the round is still pre-onSubmit.
    const second = submit();
    // The first round reached onSubmit and is now pending on its promise.
    await started;
    expect(form.isSubmitting).toBe(true);
    const third = submit();

    resolveFlight();
    await Promise.all([first, second, third]);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(form.isSubmitting).toBe(false);
    expect(form.submitCount).toBe(1);
    expect(form.isSubmitSuccessful).toBe(true);
  });

  it('a settled failed attempt does not block the next round', async () => {
    const form = createForm({
      initialValues: {name: ''},
      validate: values => (values.name ? {} : {name: 'name required'})
    });
    const onInvalidSubmit = vi.fn();
    const submit = handleSubmit(form, {onInvalidSubmit});

    await submit();
    expect(form.isSubmitting).toBe(false);
    expect(form.isSubmitSuccessful).toBe(false);
    expect(form.submitCount).toBe(1);

    await submit();
    expect(onInvalidSubmit).toHaveBeenCalledTimes(2);
    expect(form.submitCount).toBe(2);
    expect(form.isSubmitting).toBe(false);
  });
});

describe('action error landing', () => {
  it('lands ActionErrorResult.errors as per-field server errors and fails the submit', async () => {
    const form = createForm({initialValues: {email: ''}});
    const submit = handleSubmit(form, {
      onAction: async () => ({errors: {email: 'already taken'}})
    });
    await submit();
    expect(getError(form, 'email')).toEqual({
      type: 'server',
      message: 'already taken'
    });
    expect(form.isSubmitSuccessful).toBe(false);
    expect(form.isSubmitting).toBe(false);
    expect(form.submitCount).toBe(1);
  });

  it('treats an undefined action return as a successful submit', async () => {
    const form = createForm({initialValues: {email: ''}});
    const submit = handleSubmit(form, {
      onAction: async () => undefined
    });
    await submit();
    expect(form.isSubmitSuccessful).toBe(true);
    expect(form.errors.size).toBe(0);
  });

  it('replaces the previous round-trip server errors on the next attempt', async () => {
    const form = createForm({initialValues: {email: '', name: ''}});
    let round = 0;
    const submit = handleSubmit(form, {
      onAction: async () =>
        ++round === 1 ? {errors: {email: 'taken'}} : {errors: {name: 'fresh'}}
    });
    await submit();
    expect(getError(form, 'email')).toEqual({type: 'server', message: 'taken'});
    expect(form.isSubmitSuccessful).toBe(false);
    // The retry is judged on the fresh attempt: the old verdict cleared
    // and the new response's errors took its place.
    await submit();
    expect(getError(form, 'email')).toBeUndefined();
    expect(getError(form, 'name')).toEqual({type: 'server', message: 'fresh'});
    expect(form.isSubmitSuccessful).toBe(false);
  });

  it('a retry with a clean response succeeds and clears the server errors', async () => {
    const form = createForm({initialValues: {email: ''}});
    let round = 0;
    const submit = handleSubmit(form, {
      onAction: async () =>
        ++round === 1 ? {errors: {email: 'taken'}} : undefined
    });
    await submit();
    expect(getError(form, 'email')).toEqual({type: 'server', message: 'taken'});
    await submit();
    expect(getError(form, 'email')).toBeUndefined();
    expect(form.isSubmitSuccessful).toBe(true);
  });

  it('server errors never veto a retry, client errors still do', async () => {
    const form = createForm({initialValues: {email: ''}});
    setServerErrors(form, {email: 'taken'});
    setError(form, 'name', 'client says no');
    const submit = handleSubmit(form, {onAction: async () => undefined});
    await submit();
    // Blocked by the client error: the action never ran, the server
    // error is cleared (fresh attempt), the client error survives.
    expect(getError(form, 'email')).toBeUndefined();
    expect(getError(form, 'name')).toEqual({
      type: 'custom',
      message: 'client says no'
    });
    expect(form.isSubmitSuccessful).toBe(false);
  });
});
