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

describe('useTransform async transforms', () => {
  it('commits an async fromDisplay when it resolves', async () => {
    let resolveTransform;
    const fromDisplay = vi.fn(
      display =>
        new Promise(res => {
          resolveTransform = () => res(Number(display));
        })
    );
    const form = createForm({initialValues: {age: 7}});
    const {result} = renderHook(() =>
      useTransform(form, 'age', {
        toDisplay: raw => String(raw),
        fromDisplay
      })
    );
    act(() => result.current.onChange('42'));
    // Uncommitted: the store keeps the old raw value and the display
    // keeps deriving from it.
    expect(getValues(form).age).toBe(7);
    expect(result.current.value).toBe('7');
    await act(async () => resolveTransform());
    expect(getValues(form).age).toBe(42);
    expect(result.current.value).toBe('42');
  });

  it('asyncDebounceMs coalesces a burst into one commit of the last display value', async () => {
    vi.useFakeTimers();
    try {
      let resolveTransform;
      const fromDisplay = vi.fn(
        display =>
          new Promise(res => {
            resolveTransform = () => res(Number(display));
          })
      );
      const form = createForm({initialValues: {age: 7}});
      const {result} = renderHook(() =>
        useTransform(form, 'age', {
          toDisplay: raw => String(raw),
          fromDisplay,
          asyncDebounceMs: 200
        })
      );
      act(() => {
        result.current.onChange('1');
        vi.advanceTimersByTime(100);
        result.current.onChange('2');
        vi.advanceTimersByTime(100);
        result.current.onChange('3');
      });
      expect(fromDisplay).toHaveBeenCalledTimes(0);
      act(() => vi.advanceTimersByTime(200));
      expect(fromDisplay).toHaveBeenCalledTimes(1);
      expect(fromDisplay.mock.calls[0][0]).toBe('3');
      await act(async () => resolveTransform());
      expect(getValues(form).age).toBe(3);
      expect(result.current.value).toBe('3');
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops stale async resolutions — only the latest write commits', async () => {
    vi.useFakeTimers();
    try {
      const resolvers = [];
      const fromDisplay = vi.fn(
        display =>
          new Promise(res => {
            resolvers.push(() => res(Number(display)));
          })
      );
      const form = createForm({initialValues: {age: 7}});
      const {result} = renderHook(() =>
        useTransform(form, 'age', {
          toDisplay: raw => String(raw),
          fromDisplay,
          asyncDebounceMs: 50
        })
      );
      act(() => {
        result.current.onChange('1');
        vi.advanceTimersByTime(50);
        result.current.onChange('2');
        vi.advanceTimersByTime(50);
      });
      expect(resolvers).toHaveLength(2);
      // Resolve the stale transform first: it must not commit.
      await act(async () => resolvers[0]());
      expect(getValues(form).age).toBe(7);
      await act(async () => resolvers[1]());
      expect(getValues(form).age).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('debounces a sync fromDisplay too when asyncDebounceMs is set', () => {
    vi.useFakeTimers();
    try {
      const fromDisplay = vi.fn(d => Number(d));
      const form = createForm({initialValues: {age: 7}});
      const {result} = renderHook(() =>
        useTransform(form, 'age', {
          toDisplay: raw => String(raw),
          fromDisplay,
          asyncDebounceMs: 100
        })
      );
      act(() => {
        result.current.onChange('1');
        vi.advanceTimersByTime(50);
        result.current.onChange('2');
        vi.advanceTimersByTime(100);
      });
      expect(fromDisplay).toHaveBeenCalledTimes(1);
      expect(getValues(form).age).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('unmounting clears a pending debounce without committing', () => {
    vi.useFakeTimers();
    try {
      const fromDisplay = vi.fn(d => Number(d));
      const form = createForm({initialValues: {age: 7}});
      const {result, unmount} = renderHook(() =>
        useTransform(form, 'age', {
          toDisplay: raw => String(raw),
          fromDisplay,
          asyncDebounceMs: 100
        })
      );
      act(() => result.current.onChange('9'));
      unmount();
      act(() => vi.advanceTimersByTime(100));
      expect(fromDisplay).toHaveBeenCalledTimes(0);
      expect(getValues(form).age).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });
});
