import {describe, it, expect, vi} from 'vitest';
import {on} from '@for-fun/event-emitter';
import createForm, {
  getValue,
  setValue,
  getValueByPath,
  setValueByPath,
  getError,
  setError,
  setErrorByPath,
  getErrors,
  getFirstError,
  clearErrors,
  hasErrors,
  setTouched,
  hasTouched,
  isTouched,
  isDirty,
  removeField,
  setInitialValues,
  reset,
  getValues,
  ensureValidate,
  setValidatingByPath,
  unsetValidatingByPath,
  setIsSubmitting,
  incrementSubmitCount,
  setSubmitSuccessful
} from '../src/form';
import createPath from '../src/path';

describe('createForm', () => {
  it('creates a form instance', () => {
    const form = createForm();
    expect(form.values).toBeInstanceOf(Map);
    expect(form.errors).toBeInstanceOf(Map);
    expect(form.touched).toBeInstanceOf(Set);
    expect(form.validators).toBeInstanceOf(Map);
    expect(form.validating).toBeInstanceOf(Set);
    expect(form.revalidateOnChange).toBe(true);
  });

  it('merges options', () => {
    const form = createForm({initialValues: {name: 'test'}});
    expect(form.initialValues).toEqual({name: 'test'});
  });
});

describe('getValue / setValue', () => {
  it('gets and sets a field value', () => {
    const form = createForm({initialValues: {}});
    setValue(form, 'name', 'hello');
    expect(getValue(form, 'name')).toBe('hello');
  });

  it('gets initial value when no value set', () => {
    const form = createForm({initialValues: {name: 'initial'}});
    expect(getValue(form, 'name')).toBe('initial');
  });

  it('gets value by path', () => {
    const form = createForm({initialValues: {}});
    const path = createPath('user.email');
    setValueByPath(form, path, 'test@example.com');
    expect(getValueByPath(form, path)).toBe('test@example.com');
  });
});

describe('getValues', () => {
  it('returns all values merged with initialValues', () => {
    const form = createForm({initialValues: {a: 1, b: 2}});
    setValue(form, 'b', 99);
    setValue(form, 'c', 3);
    const values = getValues(form);
    expect(values).toEqual({a: 1, b: 99, c: 3});
  });
});

describe('getError / setError', () => {
  it('gets and sets a field error', () => {
    const form = createForm();
    setError(form, 'name', 'required');
    expect(getError(form, 'name')).toBe('required');
  });

  it('returns undefined when no error', () => {
    const form = createForm();
    expect(getError(form, 'name')).toBeUndefined();
  });

  it('clears error when set to undefined', () => {
    const form = createForm();
    setError(form, 'name', 'required');
    setError(form, 'name', undefined);
    expect(getError(form, 'name')).toBeUndefined();
  });
});

describe('getErrors / getFirstError / clearErrors / hasErrors', () => {
  it('getErrors returns all errors', () => {
    const form = createForm();
    setError(form, 'a', 'error a');
    setError(form, 'b', 'error b');
    expect(getErrors(form)).toEqual(['error a', 'error b']);
  });

  it('getFirstError returns first error', () => {
    const form = createForm();
    setError(form, 'a', 'first');
    expect(getFirstError(form)).toBe('first');
  });

  it('clearErrors removes all errors', () => {
    const form = createForm();
    setError(form, 'a', 'error');
    clearErrors(form);
    expect(hasErrors(form)).toBe(false);
  });

  it('hasErrors returns true when errors exist', () => {
    const form = createForm();
    expect(hasErrors(form)).toBe(false);
    setError(form, 'a', 'error');
    expect(hasErrors(form)).toBe(true);
  });
});

describe('setTouched / hasTouched / isTouched', () => {
  it('sets and checks touched state', () => {
    const form = createForm();
    expect(hasTouched(form, 'name')).toBe(false);
    setTouched(form, 'name');
    expect(hasTouched(form, 'name')).toBe(true);
  });

  it('isTouched is an alias for hasTouched', () => {
    const form = createForm();
    expect(isTouched(form, 'name')).toBe(false);
    setTouched(form, 'name');
    expect(isTouched(form, 'name')).toBe(true);
  });
});

describe('isDirty', () => {
  it('returns false when no values changed from initialValues', () => {
    const form = createForm({initialValues: {name: 'test'}});
    expect(isDirty(form)).toBe(false);
  });

  it('returns true when a value differs from initialValues', () => {
    const form = createForm({initialValues: {name: 'test'}});
    setValue(form, 'name', 'changed');
    expect(isDirty(form)).toBe(true);
  });

  it('returns false when value is set back to initial', () => {
    const form = createForm({initialValues: {name: 'test'}});
    setValue(form, 'name', 'changed');
    setValue(form, 'name', 'test');
    expect(isDirty(form)).toBe(false);
  });

  it('returns true for new field not in initialValues', () => {
    const form = createForm({initialValues: {}});
    setValue(form, 'email', 'test@example.com');
    expect(isDirty(form)).toBe(true);
  });
});

describe('removeField', () => {
  it('removes field state', () => {
    const form = createForm();
    setValue(form, 'name', 'value');
    setError(form, 'name', 'error');
    setTouched(form, 'name');
    removeField(form, 'name');
    expect(getValue(form, 'name')).toBeUndefined();
    expect(getError(form, 'name')).toBeUndefined();
    expect(hasTouched(form, 'name')).toBe(false);
  });
});

describe('setInitialValues', () => {
  it('updates initialValues', () => {
    const form = createForm({initialValues: {a: 1}});
    setInitialValues(form, {a: 2});
    expect(form.initialValues).toEqual({a: 2});
  });

  it('does not update if same reference', () => {
    const form = createForm({initialValues: {a: 1}});
    const spy = vi.fn();
    on(form.emitter, 'change', spy);
    setInitialValues(form, form.initialValues);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('reset', () => {
  it('resets all state', () => {
    const form = createForm({initialValues: {name: 'initial'}});
    setValue(form, 'name', 'changed');
    setError(form, 'name', 'error');
    setTouched(form, 'name');
    reset(form);
    expect(getValue(form, 'name')).toBeUndefined();
    expect(getError(form, 'name')).toBeUndefined();
    expect(hasTouched(form, 'name')).toBe(false);
    expect(form.values.size).toBe(0);
  });

  it('updates initialValues when provided', () => {
    const form = createForm({initialValues: {a: 1}});
    reset(form, {a: 2});
    expect(form.initialValues).toEqual({a: 2});
  });
});

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
    expect(getError(form, 'confirm')).toBe('Passwords must match');
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
    expect(getError(form, 'name')).toBe('name is required');
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
});

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
