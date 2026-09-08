import {describe, it, expect, vi} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import useTransform from '../../src/hooks/transform';
import useField from '../../src/hooks/field';
import createForm, {getValues, setValue, reset} from '../../src/form';

function numberSetup(initialValues = {age: 7}) {
  const form = createForm({initialValues});
  const {result} = renderHook(() =>
    useTransform(form, 'age', {
      toDisplay: raw => String(raw),
      fromDisplay: display => Number(display)
    })
  );
  return {form, result};
}

describe('useTransform', () => {
  it('works headless with an explicit form and identity mappings by default', () => {
    const form = createForm({initialValues: {name: 'a'}});
    const {result} = renderHook(() => useTransform(form, 'name'));
    expect(result.current.value).toBe('a');

    act(() => result.current.onChange('b'));
    expect(result.current.value).toBe('b');
    expect(getValues(form).name).toBe('b');
  });

  it('maps both directions: the store keeps the raw value, the control sees the display value', () => {
    const {form, result} = numberSetup();
    // Store 7 (number), display '7' (string).
    expect(getValues(form).age).toBe(7);
    expect(result.current.value).toBe('7');
    expect(typeof result.current.value).toBe('string');

    // Writing a display value lands the raw value in the store, and the
    // display re-derives from the store.
    act(() => result.current.onChange('42'));
    expect(getValues(form).age).toBe(42);
    expect(result.current.value).toBe('42');
  });

  it('follows programmatic writes and reset', () => {
    const {form, result} = numberSetup();
    act(() => setValue(form, 'age', 99));
    expect(result.current.value).toBe('99');

    act(() => reset(form));
    expect(result.current.value).toBe('7');
  });

  it('is leaf-scoped: sibling writes never re-render it', () => {
    const form = createForm({initialValues: {a: 1, b: 2}});
    let renders = 0;
    const {result} = renderHook(() => {
      renders++;
      return useTransform(form, 'a', {
        toDisplay: raw => String(raw),
        fromDisplay: display => Number(display)
      });
    });
    const afterMount = renders;

    act(() => setValue(form, 'b', 3));
    expect(renders).toBe(afterMount);
    expect(result.current.value).toBe('1');
  });

  it('rides the user-change pipeline when a field is mounted: the validator sees the raw value', () => {
    const form = createForm({initialValues: {age: 7}, mode: 'all'});
    const validate = vi.fn(value =>
      value > 0 ? undefined : 'must be positive'
    );
    renderHook(() => useField({form, name: 'age', validate}));
    const {result} = renderHook(() =>
      useTransform(form, 'age', {
        toDisplay: raw => String(raw),
        fromDisplay: display => Number(display)
      })
    );

    act(() => result.current.onChange('-3'));
    // The mounted field's mode gates validation, exactly like typing into
    // a bound field — and the validator reads the raw number, not the
    // display string.
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate.mock.calls[0][0]).toBe(-3);
    expect(getValues(form).age).toBe(-3);
  });

  it('degrades to a plain write with no mounted field at the path', () => {
    const {form, result} = numberSetup();
    act(() => result.current.onChange('5'));
    expect(getValues(form).age).toBe(5);
    expect(form.validators.has('["age"]')).toBe(false);
  });
});
