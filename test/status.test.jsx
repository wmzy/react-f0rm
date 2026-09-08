// The form-level status channel: setStatus/getStatus semantics, the
// payload-less 'status' event (imperative subscribe + the useStatus hook).
import {describe, it, expect, vi} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import createForm, {setStatus, setValue} from '../src/form';
import {subscribe} from '../src/subscribe';
import {useStatus, useFormState} from '../src/hooks/form';

describe('status channel', () => {
  it('starts undefined and stores what setStatus writes', () => {
    const form = createForm();
    expect(form.status).toBeUndefined();
    setStatus(form, {step: 2, session: 'ok'});
    expect(form.status).toEqual({step: 2, session: 'ok'});
  });

  it('emits the payload-less status event for imperative subscribers', () => {
    const form = createForm();
    const seen = vi.fn();
    const off = subscribe(form, {event: 'status', callback: seen});
    setStatus(form, 'processing');
    expect(seen).toHaveBeenCalledTimes(1);
    // A name never narrows a payload-less broadcast: a named subscriber
    // hears it too.
    const named = vi.fn();
    subscribe(form, {event: 'status', name: 'unrelated', callback: named});
    setStatus(form, 'done');
    expect(named).toHaveBeenCalledTimes(1);
    off();
    setStatus(form, 'again');
    // 'processing' + 'done' — the unsubscribe stopped further calls.
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('useStatus re-renders on setStatus and stays silent on other events', () => {
    const form = createForm({initialValues: {a: ''}});
    const {result} = renderHook(() => useStatus(form));
    expect(result.current).toBeUndefined();

    act(() => setStatus(form, {phase: 'review'}));
    expect(result.current).toEqual({phase: 'review'});

    // An unrelated value write re-renders nothing status-shaped: the
    // snapshot reference stays identical (useSyncExternalStore bailout).
    const before = result.current;
    act(() => setValue(form, 'a', 'x'));
    expect(result.current).toBe(before);
  });

  it('useFormState ignores status — the aggregate stays flag-only', () => {
    const form = createForm();
    const {result} = renderHook(() => useFormState(form));
    expect(result.current).not.toHaveProperty('status');
    act(() => setStatus(form, {anything: true}));
    expect(result.current).not.toHaveProperty('status');
  });
});
