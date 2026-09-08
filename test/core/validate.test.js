import {describe, it, expect, vi} from 'vitest';
import {on} from '../../src/emitter';
import createForm, {
  getValue,
  setValue,
  getError,
  getFieldErrors,
  setError,
  setErrorByPath,
  getErrors,
  hasErrors,
  setTouched,
  hasTouched,
  isDirty,
  setInitialValues,
  reset,
  getValues,
  ensureValidate,
  validate,
  setValidatingByPath,
  unsetValidatingByPath,
  handleSubmit,
  trigger,
  setServerErrors,
  revalidateFormOnChange,
  VALIDATION_OUTCOME
} from '../../src/form';
import createPath from '../../src/path';

describe('ensureValidate', () => {
  it('resolves when no validators', async () => {
    const form = createForm();
    await expect(ensureValidate(form)).resolves.toBeUndefined();
  });

  it('resolves when all validators pass (sync)', async () => {
    const form = createForm();
    form.validators.set('name', () => {
      setErrorByPath(form, createPath('name'), undefined);
    });
    await expect(ensureValidate(form)).resolves.toBeUndefined();
  });

  it('rejects when sync validator sets error', async () => {
    const form = createForm();
    const path = createPath('name');
    form.validators.set(path.key, () => {
      setErrorByPath(form, path, 'required');
    });
    await expect(ensureValidate(form)).rejects.toThrow('required');
  });

  it('attaches the full error list to the rejection error', async () => {
    // Field-validator failure: message stays the first error's text; the
    // .errors side-channel carries every error with type and path.
    const form = createForm();
    setError(form, 'other', 'preexisting');
    form.validators.set('name', () => {
      setErrorByPath(form, createPath('name'), [
        {type: 'required', message: 'first'},
        {type: 'custom', message: 'second'}
      ]);
    });
    const error = await ensureValidate(form).catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('preexisting');
    expect(error.errors).toEqual([
      {path: 'other', type: 'custom', message: 'preexisting'},
      {path: 'name', type: 'required', message: 'first'},
      {path: 'name', type: 'custom', message: 'second'}
    ]);
  });

  it('attaches the full error list on the form-level branch too', async () => {
    const form = createForm({
      initialValues: {a: 1, b: 2},
      validate: () => ({a: 'a is bad', b: {type: 'custom', message: 'b too'}})
    });
    const error = await ensureValidate(form).catch(e => e);
    expect(error.message).toBe('a is bad');
    expect(error.errors).toEqual([
      {path: 'a', type: 'custom', message: 'a is bad'},
      {path: 'b', type: 'custom', message: 'b too'}
    ]);
    // validate()'s catch-path keeps returning the message string only.
    await expect(validate(form)).resolves.toBe('a is bad');
  });

  it('waits for async validators', async () => {
    const form = createForm();
    form.validators.set('name', () => {
      setValidatingByPath(form, createPath('name'));
      setTimeout(() => {
        setErrorByPath(form, createPath('name'), 'async error');
        unsetValidatingByPath(form, createPath('name'));
      }, 10);
    });
    await expect(ensureValidate(form)).rejects.toThrow('async error');
  });
});

describe('form-level validation', () => {
  it('runs form-level validate on ensureValidate', async () => {
    const form = createForm({
      initialValues: {password: 'abc', confirm: 'xyz'},
      validate: values => {
        if (values.password !== values.confirm)
          return {confirm: 'Passwords must match'};
        return {};
      }
    });
    await expect(ensureValidate(form)).rejects.toThrow('Passwords must match');
    expect(getError(form, 'confirm')).toEqual({
      type: 'custom',
      message: 'Passwords must match'
    });
  });

  it('passes when form-level validate returns empty', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({})
    });
    await expect(ensureValidate(form)).resolves.toBeUndefined();
  });

  it('passes when form-level validate returns falsy', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => undefined
    });
    await expect(ensureValidate(form)).resolves.toBeUndefined();
  });

  it('receives current values including overrides', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: values => {
        if (values.a !== 2) return {a: 'a must be 2'};
        return {};
      }
    });
    setValue(form, 'a', 2);
    await expect(ensureValidate(form)).resolves.toBeUndefined();
  });

  it('flattens nested results to nested paths', async () => {
    const form = createForm({
      initialValues: {a: {b: ''}},
      validate: () => ({a: {b: 'msg'}})
    });
    await expect(ensureValidate(form)).rejects.toThrow('msg');
    expect(getError(form, 'a.b')).toEqual({type: 'custom', message: 'msg'});
    expect(getError(form, ['a', 'b'])).toEqual({
      type: 'custom',
      message: 'msg'
    });
  });

  it('flattens dotted keys in form-level results', async () => {
    const form = createForm({
      initialValues: {user: {name: ''}},
      validate: () => ({'user.name': 'required'})
    });
    await expect(ensureValidate(form)).rejects.toThrow('required');
    expect(getError(form, 'user.name')).toEqual({
      type: 'custom',
      message: 'required'
    });
  });

  it('keeps numeric tree keys as explicit string segments (Standard Schema issue paths stringify array indices)', async () => {
    const form = createForm({
      initialValues: {items: [{name: ''}]},
      validate: () => ({items: {0: {name: 'required'}}})
    });
    await expect(ensureValidate(form)).rejects.toThrow('required');
    expect(getError(form, 'items["0"].name')).toEqual({
      type: 'custom',
      message: 'required'
    });
  });

  it('collects every non-empty string from array values (zod formErrors style)', async () => {
    const form = createForm({
      initialValues: {name: ''},
      validate: () => ({name: ['', 'required', 'too short']})
    });
    await expect(ensureValidate(form)).rejects.toThrow('required');
    expect(getError(form, 'name')).toEqual({
      type: 'custom',
      message: 'required'
    });
    expect(getFieldErrors(form, 'name')).toEqual([
      {type: 'custom', message: 'required'},
      {type: 'custom', message: 'too short'}
    ]);
  });

  it('stores FieldError-shaped values without descending into them', async () => {
    const form = createForm({
      initialValues: {name: ''},
      validate: () => ({name: {type: 'required', message: 'nope'}})
    });
    await expect(ensureValidate(form)).rejects.toThrow('nope');
    expect(getError(form, 'name')).toEqual({type: 'required', message: 'nope'});
  });

  it('resolves when the form-level result carries no error values', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({a: ''})
    });
    await expect(ensureValidate(form)).resolves.toBeUndefined();
    expect(hasErrors(form)).toBe(false);
  });

  it('runs after field-level validators', async () => {
    const order = [];
    const form = createForm({
      initialValues: {a: 1},
      validate: () => {
        order.push('form');
        return {};
      }
    });
    form.validators.set('a', () => {
      order.push('field');
    });
    await ensureValidate(form);
    expect(order).toEqual(['field', 'form']);
  });

  it('supports async form-level validate', async () => {
    const form = createForm({
      initialValues: {name: ''},
      validate: async values => {
        await new Promise(r => setTimeout(r, 10));
        if (!values.name) return {name: 'name is required'};
        return {};
      }
    });
    await expect(ensureValidate(form)).rejects.toThrow('name is required');
    expect(getError(form, 'name')).toEqual({
      type: 'custom',
      message: 'name is required'
    });
  });

  it('does not run form-level validate when field-level fails', async () => {
    const spy = vi.fn(() => ({}));
    const form = createForm({
      initialValues: {a: 1},
      validate: spy
    });
    form.validators.set('a', () => {
      setError(form, 'a', 'field error');
    });
    await expect(ensureValidate(form)).rejects.toThrow('field error');
    expect(spy).not.toHaveBeenCalled();
  });

  it('stores branded values as the baseline above initialValues', async () => {
    const form = createForm({
      initialValues: {a: 1, b: 'raw'},
      validate: () => ({
        [VALIDATION_OUTCOME]: true,
        values: {a: 2, b: 'parsed'}
      })
    });
    await expect(ensureValidate(form)).resolves.toBeUndefined();
    expect(form.parsedValues).toEqual({a: 2, b: 'parsed'});
    expect(getValue(form, 'a')).toBe(2);
    expect(getValues(form)).toEqual({a: 2, b: 'parsed'});
    // Parsing is not a user edit: dirty stays measured against
    // initialValues only.
    expect(isDirty(form)).toBe(false);
  });

  it('lets live edits override the parsed baseline', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({
        [VALIDATION_OUTCOME]: true,
        values: {a: 2, b: 'parsed'}
      })
    });
    await ensureValidate(form);
    setValue(form, 'a', 99);
    expect(getValue(form, 'a')).toBe(99);
    expect(getValue(form, 'b')).toBe('parsed');
    expect(getValues(form)).toEqual({a: 99, b: 'parsed'});
  });

  it('clears parsedValues on reset and setInitialValues', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({[VALIDATION_OUTCOME]: true, values: {a: 2}})
    });
    await ensureValidate(form);
    expect(form.parsedValues).toEqual({a: 2});
    reset(form, {a: 1});
    expect(form.parsedValues).toBeUndefined();
    expect(getValues(form)).toEqual({a: 1});

    await ensureValidate(form);
    expect(form.parsedValues).toEqual({a: 2});
    setInitialValues(form, {a: 3});
    expect(form.parsedValues).toBeUndefined();
    expect(getValues(form)).toEqual({a: 3});
  });

  it('keeps plain (non-branded) validate results error-only', async () => {
    const failing = createForm({
      initialValues: {a: 1},
      validate: () => ({a: 'a is bad'})
    });
    await expect(ensureValidate(failing)).rejects.toThrow('a is bad');
    expect(failing.parsedValues).toBeUndefined();
    expect(getValues(failing)).toEqual({a: 1});

    const passing = createForm({
      initialValues: {a: 1},
      validate: () => ({})
    });
    await expect(ensureValidate(passing)).resolves.toBeUndefined();
    expect(passing.parsedValues).toBeUndefined();
    expect(getValues(passing)).toEqual({a: 1});
  });

  it('handles branded outcomes in trigger without bogus field errors', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({[VALIDATION_OUTCOME]: true, values: {a: 2}})
    });
    await expect(trigger(form)).resolves.toBe(true);
    expect(getErrors(form)).toEqual([]);
    expect(form.parsedValues).toEqual({a: 2});
  });

  it('accepts FieldError objects as leaf values of the error record', async () => {
    const form = createForm({
      initialValues: {a: ''},
      validate: () => ({a: {type: 'server', message: 'bad input'}})
    });
    await expect(trigger(form)).resolves.toBe(false);
    expect(getError(form, 'a')).toEqual({type: 'server', message: 'bad input'});
  });

  // ---- form-level validateDebounce --------------------------------------
  // The form-level twin of the per-field validateDebounce contract: the
  // window counts as validating (trigger/submit wait it out), kicks inside
  // the window merge into one run reading the freshest values, and a
  // submit is never raced through an open window.

  it('runs validate immediately per call when validateDebounce is unset (default regression)', async () => {
    const spy = vi.fn(() => ({}));
    const form = createForm({initialValues: {a: 1}, validate: spy});
    expect(form.validateDebounce).toBeUndefined();
    await ensureValidate(form);
    expect(spy).toHaveBeenCalledTimes(1);
    await ensureValidate(form);
    expect(spy).toHaveBeenCalledTimes(2);
    // The undebounced pipeline never marks the form as validating.
    expect(form.validating.size).toBe(0);
  });

  it('waits out the validateDebounce window before running form-level validate', async () => {
    vi.useFakeTimers();
    try {
      const spy = vi.fn(() => ({}));
      const form = createForm({
        initialValues: {a: 1},
        validate: spy,
        validateDebounce: 50
      });
      const pending = ensureValidate(form);
      // The form kick happens after ensureValidate's field-validator wait
      // (a microtask in); flush it without advancing the window.
      await vi.advanceTimersByTimeAsync(0);
      expect(spy).not.toHaveBeenCalled();
      // The pending window counts as validating, like a field's window.
      expect(form.validating.size).toBe(1);
      await vi.advanceTimersByTimeAsync(49);
      expect(spy).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(form.validating.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('merges kicks inside the window into one run reading the freshest values', async () => {
    vi.useFakeTimers();
    try {
      const seen = [];
      const form = createForm({
        initialValues: {a: 1},
        validate: values => {
          seen.push(values.a);
          return {};
        },
        validateDebounce: 50
      });
      const first = trigger(form);
      setValue(form, 'a', 2);
      const second = trigger(form);
      await vi.advanceTimersByTimeAsync(50);
      expect(await first).toBe(true);
      expect(await second).toBe(true);
      // One merged run, reading the values current when the window closed.
      expect(seen).toEqual([2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('trigger resolves only after the debounced error has landed', async () => {
    vi.useFakeTimers();
    try {
      const form = createForm({
        initialValues: {a: 1},
        validate: () => ({a: 'bad'}),
        validateDebounce: 50
      });
      const pending = trigger(form);
      let settled = false;
      pending.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(49);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toBe(false);
      expect(getError(form, 'a').message).toBe('bad');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a submit is not raced through the window: a debounced form error still blocks it', async () => {
    vi.useFakeTimers();
    try {
      const onValidSubmit = vi.fn();
      const onInvalidSubmit = vi.fn();
      const form = createForm({
        initialValues: {a: 1},
        validate: () => ({a: 'bad'}),
        validateDebounce: 50
      });
      const submit = handleSubmit(form, {onValidSubmit, onInvalidSubmit});
      const pending = submit();
      // Mid-window: the submit must not have slipped through yet.
      await vi.advanceTimersByTimeAsync(25);
      expect(form.isSubmitting).toBe(true);
      expect(onValidSubmit).not.toHaveBeenCalled();
      expect(onInvalidSubmit).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(25);
      await pending;
      expect(onValidSubmit).not.toHaveBeenCalled();
      expect(onInvalidSubmit).toHaveBeenCalledTimes(1);
      expect(form.isSubmitting).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a debounced clean form-level validate lets the submit through once the window closes', async () => {
    vi.useFakeTimers();
    try {
      const onValidSubmit = vi.fn();
      const form = createForm({
        initialValues: {a: 1},
        validate: () => ({}),
        validateDebounce: 50
      });
      const submit = handleSubmit(form, {onValidSubmit});
      const pending = submit();
      await vi.advanceTimersByTimeAsync(50);
      await pending;
      expect(onValidSubmit).toHaveBeenCalledTimes(1);
      expect(onValidSubmit).toHaveBeenCalledWith({a: 1}, undefined);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes meta.signal to the form-level validate callback', async () => {
    vi.useFakeTimers();
    try {
      const metas = [];
      const form = createForm({
        initialValues: {a: 1},
        validate: (values, meta) => {
          metas.push(meta);
          return {};
        },
        validateDebounce: 50
      });
      const pending = trigger(form);
      await vi.advanceTimersByTimeAsync(50);
      await pending;
      expect(metas).toHaveLength(1);
      expect(metas[0].form).toBe(form);
      expect(metas[0].signal.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts the superseded async round and drops its late result', async () => {
    vi.useFakeTimers();
    try {
      const deferred = [];
      const signals = [];
      const form = createForm({
        initialValues: {a: 1},
        validate: (values, {signal}) => {
          signals.push(signal);
          return new Promise(resolve => {
            deferred.push(resolve);
          });
        },
        validateDebounce: 50
      });
      const first = trigger(form);
      await vi.advanceTimersByTimeAsync(50);
      // Round 1 in flight; a kick during its flight opens a new window.
      expect(signals).toHaveLength(1);
      const second = trigger(form);
      await vi.advanceTimersByTimeAsync(50);
      // Round 2 started: round 1 is superseded — its signal fired and its
      // eventual result must be dropped, not raced home.
      expect(signals).toHaveLength(2);
      expect(signals[0].aborted).toBe(true);
      expect(signals[1].aborted).toBe(false);
      deferred[0]({a: 'stale'});
      await vi.advanceTimersByTimeAsync(0);
      expect(getError(form, 'a')).toBeUndefined();
      deferred[1]({});
      expect(await first).toBe(true);
      expect(await second).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates a rejecting debounced round to the awaiting callers', async () => {
    vi.useFakeTimers();
    try {
      const form = createForm({
        initialValues: {a: 1},
        validate: () => Promise.reject(new Error('validator blew up')),
        validateDebounce: 50
      });
      const pending = ensureValidate(form);
      // Attach the rejection handler before the window closes, so the
      // rejection never spends a tick unhandled.
      const assertion = expect(pending).rejects.toThrow('validator blew up');
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
      expect(form.validating.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // ---- form-level validateDeps --------------------------------------------
  // The form-level twin of the gated kick in useField's onChange: a user
  // change to a declared dep re-runs the form-level validate under the
  // mode/reValidateMode matrix, and each round owns (and may clear) exactly
  // the errors the previous round wrote.

  it('normalizes validateDeps into a path-key set at create time', () => {
    const form = createForm({
      initialValues: {user: {email: ''}},
      validateDeps: ['user.email', 'password']
    });
    expect(form.validateDeps).toEqual(
      new Set(['["user","email"]', '["password"]'])
    );
    expect(createForm({}).validateDeps).toBeUndefined();
  });

  it('re-runs the form validate on a declared dep change under the mode matrix', async () => {
    const seen = [];
    const form = createForm({
      initialValues: {password: '', confirm: ''},
      validate: values => {
        seen.push(values.password);
        return {};
      },
      validateDeps: ['password']
    });
    const password = createPath('password');
    const confirm = createPath('confirm');

    // Default mode ('onSubmit') with no live form-level error: a dep
    // change does not re-run the validate — same timing as a field
    // validator in an onSubmit form.
    revalidateFormOnChange(form, password, 'onSubmit');
    expect(seen).toHaveLength(0);

    // mode 'onChange': every dep change re-runs, error state or not.
    revalidateFormOnChange(form, password, 'onChange');
    expect(seen).toHaveLength(1);

    // mode 'all' behaves like 'onChange' for the change trigger.
    revalidateFormOnChange(form, password, 'all');
    expect(seen).toHaveLength(2);

    // An undeclared field never re-runs the validate, in any mode.
    revalidateFormOnChange(form, confirm, 'onChange');
    expect(seen).toHaveLength(2);

    // A form without validateDeps never re-runs either.
    const plain = createForm({
      initialValues: {password: ''},
      validate: () => ({a: 'x'})
    });
    revalidateFormOnChange(plain, createPath('password'), 'onChange');
    expect(plain.errors.size).toBe(0);
  });

  it('re-runs on dep change in mode onSubmit while the last round error is live (reValidateMode onChange)', async () => {
    const form = createForm({
      initialValues: {password: 'x', confirm: 'y'},
      validate: values =>
        values.password === values.confirm
          ? {}
          : {confirm: 'Passwords do not match'},
      validateDeps: ['password']
    });
    const password = createPath('password');

    // Submit-like round lands the mismatch error.
    await expect(trigger(form)).resolves.toBe(false);
    expect(getError(form, 'confirm')?.message).toBe('Passwords do not match');

    // Now the dep change re-runs under the default reValidateMode
    // ('onChange') because the form-level round's error is still live.
    setValue(form, 'password', 'y');
    revalidateFormOnChange(form, password, 'onSubmit');
    await Promise.resolve();
    expect(getError(form, 'confirm')).toBeUndefined();
  });

  it('does not re-run on dep change when reValidateMode is onBlur or onSubmit', async () => {
    for (const reValidateMode of ['onBlur', 'onSubmit']) {
      const runs = vi.fn(() => ({confirm: 'Passwords do not match'}));
      const form = createForm({
        initialValues: {password: '', confirm: ''},
        validate: runs,
        reValidateMode,
        validateDeps: ['password']
      });
      await trigger(form);
      expect(runs).toHaveBeenCalledTimes(1);
      expect(getError(form, 'confirm')).toBeDefined();

      // The round's error is live, but a change is not a blur: the
      // re-run waits for the reValidateMode's own trigger.
      revalidateFormOnChange(form, createPath('password'), 'onSubmit');
      await Promise.resolve();
      expect(runs).toHaveBeenCalledTimes(1);
      expect(getError(form, 'confirm')).toBeDefined();
    }
  });

  it('re-runs on dep change in mode onTouched only once the dep field was touched', async () => {
    const runs = vi.fn(() => ({}));
    const form = createForm({
      initialValues: {password: ''},
      validate: runs,
      mode: 'onTouched',
      validateDeps: ['password']
    });
    const password = createPath('password');

    revalidateFormOnChange(form, password, 'onTouched');
    expect(runs).toHaveBeenCalledTimes(0);

    setTouched(form, 'password');
    revalidateFormOnChange(form, password, 'onTouched');
    expect(runs).toHaveBeenCalledTimes(1);
  });

  it('each round clears the previous round errors before landing its own', async () => {
    let mismatch = true;
    const form = createForm({
      initialValues: {password: 'a', confirm: 'b'},
      validate: () =>
        mismatch
          ? {confirm: 'Passwords do not match', password: 'differs'}
          : {},
      validateDeps: ['password']
    });

    await expect(trigger(form)).resolves.toBe(false);
    expect(getError(form, 'confirm')).toBeDefined();
    expect(getError(form, 'password')).toBeDefined();

    // The dep change re-run passes: every error the round wrote
    // disappears — including on the dep field itself.
    mismatch = false;
    revalidateFormOnChange(form, createPath('password'), 'onChange');
    await Promise.resolve();
    expect(getError(form, 'confirm')).toBeUndefined();
    expect(getError(form, 'password')).toBeUndefined();
    expect(form.errors.size).toBe(0);
  });

  it('a passing re-run also clears through a falsy result', async () => {
    let mismatch = true;
    const form = createForm({
      initialValues: {password: 'a', confirm: 'b'},
      validate: () => (mismatch ? {confirm: 'mismatch'} : undefined),
      validateDeps: ['password']
    });
    await expect(trigger(form)).resolves.toBe(false);
    mismatch = false;
    revalidateFormOnChange(form, createPath('password'), 'onChange');
    await Promise.resolve();
    expect(getError(form, 'confirm')).toBeUndefined();
  });

  it('clearing is scoped to the round own errors — foreign writes survive', async () => {
    let mismatch = true;
    const form = createForm({
      initialValues: {password: '', confirm: '', email: ''},
      validate: () => (mismatch ? {confirm: 'mismatch'} : {}),
      validateDeps: ['password']
    });
    await trigger(form);
    // Errors the round never wrote: a field validator's / manual setError
    // and a server error.
    setError(form, 'email', 'taken');
    setServerErrors(form, {password: 'expired'}, {keepExisting: true});

    mismatch = false;
    revalidateFormOnChange(form, createPath('password'), 'onChange');
    await Promise.resolve();
    expect(getError(form, 'confirm')).toBeUndefined();
    expect(getError(form, 'email')?.message).toBe('taken');
    expect(getError(form, 'password')?.message).toBe('expired');
  });

  it('a foreign error written over the round key is not cleared by the next round', async () => {
    let mismatch = true;
    const form = createForm({
      initialValues: {confirm: ''},
      validate: () => (mismatch ? {confirm: 'round error'} : {}),
      validateDeps: ['confirm']
    });
    await trigger(form);
    expect(getError(form, 'confirm')?.message).toBe('round error');
    // A foreign write replaces the stored array: the key is no longer
    // the round's to own, so the next round may neither clear it...
    setError(form, 'confirm', 'manual error');
    mismatch = false;
    revalidateFormOnChange(form, createPath('confirm'), 'onChange');
    await Promise.resolve();
    expect(getError(form, 'confirm')?.message).toBe('manual error');
  });

  it('without validateDeps the historical behavior is unchanged: a re-run never clears', async () => {
    let mismatch = true;
    const form = createForm({
      initialValues: {password: 'a', confirm: 'b'},
      validate: () => (mismatch ? {confirm: 'Passwords do not match'} : {}),
      reValidateMode: 'onChange'
    });
    await expect(trigger(form)).resolves.toBe(false);
    mismatch = false;
    // Only submit/trigger re-runs — and even then the stale error stays.
    await trigger(form);
    expect(getError(form, 'confirm')?.message).toBe('Passwords do not match');
  });

  it('dep-change kicks merge inside the validateDebounce window like any other kick', async () => {
    vi.useFakeTimers();
    try {
      const runs = vi.fn(() => ({}));
      const form = createForm({
        initialValues: {password: ''},
        validate: runs,
        validateDebounce: 50,
        validateDeps: ['password']
      });
      const password = createPath('password');
      revalidateFormOnChange(form, password, 'onChange');
      setValue(form, 'password', 'a');
      revalidateFormOnChange(form, password, 'onChange');
      expect(runs).toHaveBeenCalledTimes(0);
      expect(form.validating.size).toBe(1);
      await vi.advanceTimersByTimeAsync(50);
      expect(runs).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('trigger', () => {
  it('runs every validator when called without a name or with undefined', () => {
    const form = createForm();
    const nameValidator = vi.fn();
    const emailValidator = vi.fn();
    form.validators.set('["name"]', nameValidator);
    form.validators.set('["email"]', emailValidator);

    trigger(form);
    trigger(form, undefined);

    expect(nameValidator).toHaveBeenCalledTimes(2);
    expect(emailValidator).toHaveBeenCalledTimes(2);
  });

  it('runs only the named field validator', () => {
    const form = createForm();
    const nameValidator = vi.fn();
    const emailValidator = vi.fn();
    form.validators.set('["name"]', nameValidator);
    form.validators.set('["email"]', emailValidator);

    trigger(form, 'name');

    expect(nameValidator).toHaveBeenCalledTimes(1);
    expect(emailValidator).not.toHaveBeenCalled();
  });

  it('runs each validator for an array of names', () => {
    const form = createForm();
    const nameValidator = vi.fn();
    const emailValidator = vi.fn();
    const ageValidator = vi.fn();
    form.validators.set('["name"]', nameValidator);
    form.validators.set('["email"]', emailValidator);
    form.validators.set('["age"]', ageValidator);

    trigger(form, ['name', 'age']);

    expect(nameValidator).toHaveBeenCalledTimes(1);
    expect(ageValidator).toHaveBeenCalledTimes(1);
    expect(emailValidator).not.toHaveBeenCalled();
  });

  it('does nothing for an empty name array', () => {
    const form = createForm();
    const nameValidator = vi.fn();
    form.validators.set('["name"]', nameValidator);

    trigger(form, []);

    expect(nameValidator).not.toHaveBeenCalled();
  });

  it('treats a number-bearing array as a single segments path', () => {
    const form = createForm();
    const firstItem = vi.fn();
    const secondItem = vi.fn();
    form.validators.set('["items",0,"qty"]', firstItem);
    form.validators.set('["items",1,"qty"]', secondItem);

    trigger(form, ['items', 0, 'qty']);

    expect(firstItem).toHaveBeenCalledTimes(1);
    expect(secondItem).not.toHaveBeenCalled();
  });

  it('ignores names without a registered validator', () => {
    const form = createForm();
    expect(() => trigger(form, 'missing')).not.toThrow();
  });

  it('resolves true immediately when no validators are registered', async () => {
    const form = createForm();
    await expect(trigger(form)).resolves.toBe(true);
    await expect(trigger(form, 'name')).resolves.toBe(true);
    await expect(trigger(form, [])).resolves.toBe(true);
  });

  it('resolves false once an async validator has landed its error', async () => {
    const form = createForm();
    const path = createPath('name');
    form.validators.set(path.key, () => {
      setValidatingByPath(form, path);
      setTimeout(() => {
        setErrorByPath(form, path, 'async error');
        unsetValidatingByPath(form, path);
      }, 10);
    });

    await expect(trigger(form, 'name')).resolves.toBe(false);
    expect(getError(form, 'name')).toEqual({
      type: 'custom',
      message: 'async error'
    });
  });

  it('resolves true after an async passing validator clears its error', async () => {
    const form = createForm();
    const path = createPath('name');
    setError(form, 'name', 'stale error');
    form.validators.set(path.key, () => {
      setValidatingByPath(form, path);
      setTimeout(() => {
        setErrorByPath(form, path, undefined);
        unsetValidatingByPath(form, path);
      }, 10);
    });

    await expect(trigger(form, 'name')).resolves.toBe(true);
    expect(getError(form, 'name')).toBeUndefined();
  });

  it('resolves false for a sync validator that sets an error', async () => {
    const form = createForm();
    form.validators.set('["name"]', () => {
      setError(form, 'name', 'required');
    });

    await expect(trigger(form, 'name')).resolves.toBe(false);
  });

  it('scopes the result to the triggered names only', async () => {
    const form = createForm();
    form.validators.set('["good"]', () => {
      setErrorByPath(form, createPath('good'), undefined);
    });
    form.validators.set('["bad"]', () => {
      setErrorByPath(form, createPath('bad'), 'nope');
    });
    setError(form, 'other', 'error on an untriggered field');

    await expect(trigger(form, 'good')).resolves.toBe(true);
    await expect(trigger(form, ['good'])).resolves.toBe(true);
    // `other`'s error is out of scope; triggering `bad` fails the scope.
    await expect(trigger(form, ['good', 'bad'])).resolves.toBe(false);
    await expect(trigger(form, 'bad')).resolves.toBe(false);
  });

  it('waits for async validators when called without a name', async () => {
    const form = createForm();
    const path = createPath('name');
    form.validators.set(path.key, () => {
      setValidatingByPath(form, path);
      setTimeout(() => {
        setErrorByPath(form, path, 'async error');
        unsetValidatingByPath(form, path);
      }, 10);
    });

    await expect(trigger(form)).resolves.toBe(false);
    expect(getError(form, 'name')).toEqual({
      type: 'custom',
      message: 'async error'
    });
  });

  it('runs form-level validate without a name and flattens its errors', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({a: 'form-level error'})
    });

    await expect(trigger(form)).resolves.toBe(false);
    expect(getError(form, 'a')).toEqual({
      type: 'custom',
      message: 'form-level error'
    });
  });

  it('resolves true without a name when fields and form-level pass', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({})
    });
    form.validators.set('["a"]', () => {
      setErrorByPath(form, createPath('a'), undefined);
    });

    await expect(trigger(form)).resolves.toBe(true);
    expect(hasErrors(form)).toBe(false);
  });

  it('skips form-level validate when triggered with a name', async () => {
    const spy = vi.fn(() => ({b: 'form-level error'}));
    const form = createForm({initialValues: {a: 1}, validate: spy});
    form.validators.set('["a"]', () => {
      setErrorByPath(form, createPath('a'), undefined);
    });

    await expect(trigger(form, 'a')).resolves.toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(hasErrors(form)).toBe(false);
  });

  it('trigger(name) does not wait for an unrelated in-flight validator', async () => {
    const form = createForm();
    const slow = createPath('slow');
    let slowSettled = false;
    form.validators.set(slow.key, () => {
      setValidatingByPath(form, slow);
      setTimeout(() => {
        slowSettled = true;
        unsetValidatingByPath(form, slow);
      }, 30);
    });
    form.validators.set('["a"]', () => {
      setErrorByPath(form, createPath('a'), undefined);
    });

    // Kick the slow validator the way a user edit would, then trigger an
    // unrelated field: the round never reads `slow`, so it must resolve
    // while `slow` is still in flight.
    form.validators.get(slow.key)();
    expect(form.validating.has(slow.key)).toBe(true);
    await expect(trigger(form, 'a')).resolves.toBe(true);
    expect(slowSettled).toBe(false);
    expect(form.validating.has(slow.key)).toBe(true);

    // Without a name the wait stays whole-form: it rides `slow` out.
    await expect(trigger(form)).resolves.toBe(true);
    expect(slowSettled).toBe(true);
    expect(form.validating.has(slow.key)).toBe(false);
  });

  it('trigger(names) waits for every triggered key before resolving', async () => {
    const form = createForm();
    const a = createPath('a');
    const c = createPath('c');
    let cSettled = false;
    form.validators.set(a.key, () => {
      setValidatingByPath(form, a);
      setTimeout(() => {
        setErrorByPath(form, a, undefined);
        unsetValidatingByPath(form, a);
      }, 10);
    });
    form.validators.set(c.key, () => {
      setValidatingByPath(form, c);
      setTimeout(() => {
        cSettled = true;
        setErrorByPath(form, c, undefined);
        unsetValidatingByPath(form, c);
      }, 30);
    });

    // Trigger a and c together: the promise must wait for BOTH triggered
    // keys — the slow one included — so both marks are gone at resolution.
    await expect(trigger(form, ['a', 'c'])).resolves.toBe(true);
    expect(cSettled).toBe(true);
    expect(form.validating.has(a.key)).toBe(false);
    expect(form.validating.has(c.key)).toBe(false);
  });

  it('waits out a pending debounce window before resolving', async () => {
    const form = createForm();
    const path = createPath('name');
    // Hand-rolled stand-in for useValidate's debounce contract: the field
    // counts as validating while the timer is pending and settles inside
    // it, which is exactly what trigger's validating-set wait rides on.
    form.validators.set(path.key, () => {
      setValidatingByPath(form, path);
      setTimeout(() => {
        setErrorByPath(form, path, 'late');
        unsetValidatingByPath(form, path);
      }, 20);
    });

    const pending = trigger(form);
    expect(form.validating.size).toBe(1);
    await expect(pending).resolves.toBe(false);
    expect(getError(form, 'name')).toEqual({type: 'custom', message: 'late'});
  });

  it('resolves true once a debounced validator settles clean', async () => {
    const form = createForm();
    const path = createPath('name');
    form.validators.set(path.key, () => {
      setValidatingByPath(form, path);
      setTimeout(() => {
        setErrorByPath(form, path, undefined);
        unsetValidatingByPath(form, path);
      }, 20);
    });

    const pending = trigger(form, 'name');
    expect(form.validating.size).toBe(1);
    await expect(pending).resolves.toBe(true);
    expect(getError(form, 'name')).toBeUndefined();
  });

  it('marks the named field touched only when shouldTouch is set', async () => {
    const form = createForm();
    form.validators.set('["a"]', () => {});

    await trigger(form, 'a');
    expect(hasTouched(form, 'a')).toBe(false);

    await trigger(form, 'a', {shouldTouch: true});
    expect(hasTouched(form, 'a')).toBe(true);
  });

  it('marks every triggered name touched for a name array', async () => {
    const form = createForm();
    form.validators.set('["a"]', () => {});
    form.validators.set('["b"]', () => {});
    form.validators.set('["c"]', () => {});

    await trigger(form, ['a', 'b'], {shouldTouch: true});

    expect(hasTouched(form, 'a')).toBe(true);
    expect(hasTouched(form, 'b')).toBe(true);
    // `c` is out of the triggered scope.
    expect(hasTouched(form, 'c')).toBe(false);
  });

  it('marks every registered field touched when no name is given', async () => {
    const form = createForm();
    form.validators.set('["a"]', () => {});
    form.validators.set('["items",0,"qty"]', () => {});

    await trigger(form, undefined, {shouldTouch: true});

    expect(hasTouched(form, 'a')).toBe(true);
    // Registered keys keep their segments shape — index segments included.
    expect(hasTouched(form, ['items', 0, 'qty'])).toBe(true);
  });

  it('still marks touched when validation fails', async () => {
    const form = createForm();
    form.validators.set('["a"]', () => {
      setError(form, 'a', 'required');
    });

    await expect(trigger(form, 'a', {shouldTouch: true})).resolves.toBe(false);
    expect(getError(form, 'a')).toEqual({type: 'custom', message: 'required'});
    expect(hasTouched(form, 'a')).toBe(true);
  });

  it('applies shouldTouch only after the round settles', async () => {
    vi.useFakeTimers();
    try {
      const form = createForm();
      const path = createPath('a');
      form.validators.set(path.key, () => {
        setValidatingByPath(form, path);
        setTimeout(() => unsetValidatingByPath(form, path), 20);
      });

      const pending = trigger(form, 'a', {shouldTouch: true});
      // Round still in flight: nothing is touched mid-wait.
      expect(hasTouched(form, 'a')).toBe(false);

      await vi.advanceTimersByTimeAsync(20);
      await expect(pending).resolves.toBe(true);
      expect(hasTouched(form, 'a')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('trigger shouldFocus', () => {
  it('emits focusError with the first errored triggered key', async () => {
    const form = createForm();
    const focusSpy = vi.fn();
    on(form.emitter, 'focusError', focusSpy);
    form.validators.set('["a"]', () => setError(form, 'a', 'bad a'));
    form.validators.set('["b"]', () => setError(form, 'b', 'bad b'));

    await trigger(form, ['b', 'a'], {shouldFocus: true});

    expect(focusSpy).toHaveBeenCalledTimes(1);
    // First errored key among the triggered scope: b was triggered first.
    expect(focusSpy).toHaveBeenCalledWith('["b"]');
  });

  it('does not focus other fields errors on a named trigger', async () => {
    const form = createForm();
    const focusSpy = vi.fn();
    on(form.emitter, 'focusError', focusSpy);
    setError(form, 'other', 'pre-existing');
    form.validators.set('["a"]', () => setError(form, 'a', 'bad a'));

    await trigger(form, 'a', {shouldFocus: true});

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledWith('["a"]');
  });

  it('emits nothing when the round passes or shouldFocus is off', async () => {
    const form = createForm();
    const focusSpy = vi.fn();
    on(form.emitter, 'focusError', focusSpy);
    form.validators.set('["a"]', () => {});
    await trigger(form, undefined, {shouldFocus: true});
    expect(focusSpy).not.toHaveBeenCalled();

    form.validators.set('["a"]', () => setError(form, 'a', 'bad a'));
    await trigger(form);
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('without a name uses the errors Map first key, like handleSubmit', async () => {
    const form = createForm();
    const focusSpy = vi.fn();
    on(form.emitter, 'focusError', focusSpy);
    form.validators.set('["a"]', () => setError(form, 'a', 'bad a'));
    form.validators.set('["b"]', () => setError(form, 'b', 'bad b'));

    await trigger(form, undefined, {shouldFocus: true});

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledWith('["a"]');
  });
});
