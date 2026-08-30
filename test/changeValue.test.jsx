// changeValue / changeValueByPath: path-based writes with user-change
// semantics. A write through them must behave exactly like calling the
// mounted field's own onChange — mode/reValidateMode-gated validation
// included — and fall back to a plain value set when no field is mounted
// on the path. This is the channel component-library bridges (controls
// bound to a field value) need: they cannot rebuild the gating from public
// form state because the effective per-field mode and live-error view live
// inside useField's onChange closure.
import {describe, it, expect, vi} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import useField from '../src/hooks/field';
import createForm, {
  changeValue,
  changeValueByPath,
  getError,
  getValue,
  setValue
} from '../src/form';
import createPath from '../src/path';

const required = v => (v ? undefined : 'required');

describe('changeValue', () => {
  it('re-validates an errored field under the default reValidateMode', () => {
    const form = createForm({initialValues: {a: ''}});
    const validate = vi.fn(required);
    renderHook(() => useField({form, name: 'a', validate}));

    // onSubmit mode: a change alone validates nothing, even empty→empty.
    act(() => changeValue(form, 'a', 'x'));
    expect(validate).toHaveBeenCalledTimes(0);

    // Seed the error the way the default mode does: a failed submit.
    validate.mockReturnValue('required');
    act(() => {
      form.validators.get(createPath('a').key)();
    });
    expect(getError(form, 'a').message).toBe('required');
    validate.mockClear();

    // reValidateMode 'onChange': now every change re-validates the field.
    validate.mockReturnValue(undefined);
    act(() => changeValue(form, 'a', 'ok'));
    expect(validate).toHaveBeenCalledTimes(1);
    expect(getError(form, 'a')).toBeUndefined();
    expect(getValue(form, 'a')).toBe('ok');
  });

  it('matches useField.onChange outcome for the same write script', () => {
    // The parity net: two identical fields on identical forms, one written
    // through its own onChange, one through changeValue — every observable
    // (value, error) must agree after each step, across modes and the
    // errored/not-errored transitions of reValidateMode.
    const script = ['', 'x', '', 'ok', ''];
    for (const mode of ['onSubmit', 'onBlur', 'onChange', 'onTouched', 'all']) {
      const native = createForm({initialValues: {a: ''}, mode});
      const bridged = createForm({initialValues: {a: ''}, mode});
      const n = renderHook(() =>
        useField({form: native, name: 'a', validate: required})
      );
      renderHook(() =>
        useField({form: bridged, name: 'a', validate: required})
      );

      for (const v of script) {
        act(() => n.result.current.onChange(v));
        act(() => changeValue(bridged, 'a', v));
        expect(getValue(bridged, 'a')).toBe(getValue(native, 'a'));
        expect(getError(bridged, 'a')?.message ?? null).toBe(
          getError(native, 'a')?.message ?? null
        );
      }

      // And through the errored window: force an error on both, then keep
      // writing — reValidateMode 'onChange' (the default) must fire on
      // both channels with identical results.
      act(() => {
        native.validators.get(createPath('a').key)();
        bridged.validators.get(createPath('a').key)();
      });
      expect(getError(bridged, 'a').message).toBe('required');
      for (const v of script) {
        act(() => n.result.current.onChange(v));
        act(() => changeValue(bridged, 'a', v));
        expect(getValue(bridged, 'a')).toBe(getValue(native, 'a'));
        expect(getError(bridged, 'a')?.message ?? null).toBe(
          getError(native, 'a')?.message ?? null
        );
      }
    }
  });

  it('respects a per-field mode override, unlike setValue shouldValidate', () => {
    // The override lives only in the field's own onChange closure — a
    // bridge recomputing the gate from form-level state would get this
    // wrong (validate nothing), and setValue's unconditional
    // shouldValidate would get it wrong the other way (validates fields
    // that opted out).
    const form = createForm({initialValues: {a: '', b: ''}});
    const validateA = vi.fn(required);
    const validateB = vi.fn(required);
    renderHook(() =>
      useField({form, name: 'a', mode: 'onChange', validate: validateA})
    );
    renderHook(() => useField({form, name: 'b', validate: validateB}));

    act(() => changeValue(form, 'a', ''));
    expect(validateA).toHaveBeenCalledTimes(1); // override: onChange
    expect(validateB).toHaveBeenCalledTimes(0); // form stays onSubmit
  });

  it('honors the field validateDebounce window', () => {
    vi.useFakeTimers();
    try {
      const form = createForm({initialValues: {a: ''}});
      const validate = vi.fn(required);
      renderHook(() =>
        useField({form, name: 'a', validate, validateDebounce: 300})
      );

      // Seed an error so reValidateMode 'onChange' kicks on every change.
      // The kick itself is debounced — ride out the window to land it.
      act(() => form.validators.get(createPath('a').key)());
      act(() => vi.advanceTimersByTime(300));
      expect(getError(form, 'a').message).toBe('required');
      validate.mockClear();

      // Three writes inside one window: only the last runs the validator.
      act(() => changeValue(form, 'a', 'x'));
      act(() => changeValue(form, 'a', 'y'));
      act(() => changeValue(form, 'a', 'z'));
      expect(validate).toHaveBeenCalledTimes(0);
      act(() => vi.advanceTimersByTime(300));
      expect(validate).toHaveBeenCalledTimes(1);
      expect(validate).toHaveBeenLastCalledWith('z', expect.anything());
      expect(getValue(form, 'a')).toBe('z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to a plain set when no field is mounted on the path', () => {
    const form = createForm({initialValues: {a: ''}});
    // No useField ever mounted: the write must land without throwing and
    // without any validation side effect.
    expect(() => act(() => changeValue(form, 'a', 'late'))).not.toThrow();
    expect(getValue(form, 'a')).toBe('late');
    expect(form.errors.size).toBe(0);
  });

  it('falls back to a plain set after the field unmounts', () => {
    const form = createForm({initialValues: {a: ''}});
    const field = renderHook(() =>
      useField({form, name: 'a', validate: required})
    );
    // Registered while mounted — and it is the field's own onChange.
    expect(form.changeHandlers.get(createPath('a').key)).toBe(
      field.result.current.onChange
    );
    field.unmount();

    act(() => changeValue(form, 'a', 'after'));
    expect(getValue(form, 'a')).toBe('after');
    expect(form.errors.size).toBe(0);
    // The registration is gone, not leaked.
    expect(form.changeHandlers.has(createPath('a').key)).toBe(false);
  });

  it('changeValueByPath takes a parsed path', () => {
    const form = createForm({initialValues: {nested: {list: ['']}}});
    renderHook(() =>
      useField({form, name: 'nested.list[0]', validate: required})
    );

    // Seed the error, then clear it through the path variant.
    act(() => form.validators.get(createPath('nested.list[0]').key)());
    expect(getError(form, 'nested.list[0]').message).toBe('required');
    act(() => changeValueByPath(form, createPath('nested.list[0]'), 'filled'));
    expect(getError(form, 'nested.list[0]')).toBeUndefined();
    expect(getValue(form, 'nested.list[0]')).toBe('filled');
  });

  it('unlike setValue, never touches validation for unerrored onSubmit fields', () => {
    // Pin the contrast with the imperative channel: setValue's
    // shouldValidate is an unconditional kick; changeValue is the gated
    // user-change channel and must stay quiet where a user typing would be.
    const form = createForm({initialValues: {a: ''}});
    const validate = vi.fn(required);
    renderHook(() => useField({form, name: 'a', validate}));

    act(() => setValue(form, 'a', 'x', {shouldValidate: true}));
    expect(validate).toHaveBeenCalledTimes(1);

    act(() => changeValue(form, 'a', 'y'));
    expect(validate).toHaveBeenCalledTimes(1); // still just the setValue kick
  });
});
