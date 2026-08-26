// Per-field validation mode override: a field declaring `mode` validates on
// its own schedule instead of `form.mode`, other fields keep the form-level
// timing, and once a field has an error the form-level `reValidateMode`
// governs re-validation for every field — override included.
import {describe, it, expect, vi} from 'vitest';
import {
  renderHook,
  render,
  screen,
  act,
  fireEvent
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import useField from '../../src/hooks/field';
import createForm, {getError, handleSubmit} from '../../src/form';
import {Field} from '../../src/components/Field';
import Form from '../../src/components/Form';

const required = v => (v ? undefined : 'required');

describe('per-field mode override', () => {
  it('a mode:"onBlur" field validates on blur while the form stays onSubmit', () => {
    const form = createForm({initialValues: {a: '', b: ''}});
    const validateA = vi.fn(v => (v ? undefined : 'a required'));
    const validateB = vi.fn(v => (v ? undefined : 'b required'));
    const a = renderHook(() =>
      useField({form, name: 'a', mode: 'onBlur', validate: validateA})
    );
    const b = renderHook(() =>
      useField({form, name: 'b', validate: validateB})
    );

    // Typing validates nothing in an onSubmit form — the override field
    // included, even when the change leaves it empty.
    act(() => a.result.current.onChange('x'));
    act(() => a.result.current.onChange(''));
    expect(validateA).toHaveBeenCalledTimes(0);

    // Blur validates the overriding field.
    act(() => a.result.current.onBlur());
    expect(validateA).toHaveBeenCalledTimes(1);
    expect(a.result.current.error).toBe('a required');
    expect(getError(form, 'a')).toEqual({
      type: 'custom',
      message: 'a required'
    });

    // The sibling keeps the form-level timing: blur does not validate it.
    act(() => b.result.current.onBlur());
    expect(validateB).toHaveBeenCalledTimes(0);
    expect(b.result.current.error).toBeUndefined();
    expect(getError(form, 'b')).toBeUndefined();
  });

  it('a mode:"onSubmit" field opts out of an onChange form without touching siblings', () => {
    const form = createForm({initialValues: {a: '', b: ''}, mode: 'onChange'});
    const validateA = vi.fn(required);
    const validateB = vi.fn(required);
    const a = renderHook(() =>
      useField({form, name: 'a', mode: 'onSubmit', validate: validateA})
    );
    const b = renderHook(() =>
      useField({form, name: 'b', validate: validateB})
    );

    act(() => a.result.current.onChange('x'));
    act(() => a.result.current.onBlur());
    expect(validateA).toHaveBeenCalledTimes(0);

    // The sibling still follows the form-level onChange timing.
    act(() => b.result.current.onChange(''));
    expect(validateB).toHaveBeenCalledTimes(1);
  });

  it('a mode:"onChange" field validates on every change', () => {
    const form = createForm({initialValues: {a: ''}});
    const validate = vi.fn(required);
    const {result} = renderHook(() =>
      useField({form, name: 'a', mode: 'onChange', validate})
    );

    act(() => result.current.onChange(''));
    expect(validate).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('required');

    act(() => result.current.onChange('filled'));
    expect(validate).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeUndefined();
  });

  it('a mode:"onTouched" field validates on first blur then on every change', () => {
    const form = createForm({initialValues: {a: ''}});
    const validate = vi.fn(required);
    const {result} = renderHook(() =>
      useField({form, name: 'a', mode: 'onTouched', validate})
    );

    // Before the first touch, changes do not validate.
    act(() => result.current.onChange('x'));
    act(() => result.current.onChange(''));
    expect(validate).toHaveBeenCalledTimes(0);

    // First blur validates.
    act(() => result.current.onBlur());
    expect(validate).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('required');

    // After the touch, every change re-validates.
    act(() => result.current.onChange('filled'));
    expect(validate).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeUndefined();
  });

  it('a mode:"all" field validates on both change and blur', () => {
    const form = createForm({initialValues: {a: ''}});
    const validate = vi.fn(required);
    const {result} = renderHook(() =>
      useField({form, name: 'a', mode: 'all', validate})
    );

    act(() => result.current.onChange(''));
    expect(validate).toHaveBeenCalledTimes(1);
    act(() => result.current.onBlur());
    expect(validate).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe('required');
  });

  it('after a failed submit, reValidateMode:"onChange" governs the overridden field', async () => {
    // Field mode onBlur, form mode onSubmit: after the submit lands errors,
    // typing re-validates despite the field's own onBlur timing.
    const form = createForm({initialValues: {a: ''}});
    const validate = vi.fn(v => (v ? undefined : 'a required'));
    const {result} = renderHook(() =>
      useField({form, name: 'a', mode: 'onBlur', validate})
    );

    const submit = handleSubmit(form, {
      onValidSubmit: () => {
        throw new Error('must not submit');
      }
    });
    await act(async () => {
      await submit();
    });
    expect(getError(form, 'a')).toEqual({
      type: 'custom',
      message: 'a required'
    });

    // reValidateMode defaults to onChange: the change kick re-validates and
    // clears the error — the field's onBlur override does not narrow it.
    act(() => result.current.onChange('filled'));
    expect(validate).toHaveBeenCalledTimes(2); // submit + re-validate
    expect(result.current.error).toBeUndefined();
  });

  it('after a failed submit, reValidateMode:"onBlur" governs the overridden field', async () => {
    // Field mode onBlur, form mode onSubmit, reValidateMode onBlur: the
    // override changes when validation starts, never the form-level
    // re-validation schedule — a change stays silent while the error
    // window is open, the next blur re-validates.
    const form = createForm({initialValues: {a: ''}, reValidateMode: 'onBlur'});
    const validate = vi.fn(v => (v ? undefined : 'a required'));
    const {result} = renderHook(() =>
      useField({form, name: 'a', mode: 'onBlur', validate})
    );

    const submit = handleSubmit(form, {
      onValidSubmit: () => {
        throw new Error('must not submit');
      }
    });
    await act(async () => {
      await submit();
    });
    expect(getError(form, 'a')).toEqual({
      type: 'custom',
      message: 'a required'
    });

    // Neither the field's onBlur mode nor the form's onBlur reValidateMode
    // fires on change — the error survives the edit...
    act(() => result.current.onChange('filled'));
    expect(validate).toHaveBeenCalledTimes(1); // submit only
    expect(result.current.error).toBe('a required');

    // ...and the next blur re-validates, clearing the error.
    act(() => result.current.onBlur());
    expect(validate).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeUndefined();
  });

  it('<Field mode> routes to useField and never leaks onto the DOM element', async () => {
    const user = userEvent.setup();
    const form = createForm({initialValues: {email: ''}});
    render(
      <Form form={form}>
        <Field
          name="email"
          mode="onBlur"
          data-testid="email"
          validate={required}
        />
      </Form>
    );
    const input = screen.getByTestId('email');

    // Edits stay silent in the onSubmit form — the override is in effect...
    await user.type(input, 'a{backspace}');
    expect(getError(form, 'email')).toBeUndefined();

    // ...and blur surfaces the error.
    fireEvent.blur(input);
    expect(getError(form, 'email')).toEqual({
      type: 'custom',
      message: 'required'
    });

    // `mode` is a field option, not a DOM attribute.
    expect(input.hasAttribute('mode')).toBe(false);
  });
});
