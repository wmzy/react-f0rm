// Headless `watch(form, event, getter, isEqual?)` — the framework-free
// counterpart of useWatch: a subscribe/getSnapshot handle any reactive
// runtime (or plain imperative code) can bind to. React composition
// (useSyncExternalStore) is exercised too, since that is the advertised
// adapter pattern.
import {describe, it, expect, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import * as React from 'react';
import createForm, {getValue, reset, setValue} from '../src/form';
import {watch} from '../src/subscribe';

function makeForm() {
  return createForm({initialValues: {email: 'a@b.c', count: 0}});
}

describe('watch', () => {
  it('returns the current snapshot and recomputes after invalidation', () => {
    const form = makeForm();
    const handle = watch(form, 'change', () => getValue(form, 'count'));
    expect(handle.getSnapshot()).toBe(0);
    setValue(form, 'count', 1);
    // Invalidation only drops the cache; the read recomputes.
    expect(handle.getSnapshot()).toBe(1);
    // Repeated reads share one reference until the next write.
    expect(handle.getSnapshot()).toBe(handle.getSnapshot());
  });

  it('notifies subscribers on matching events and not after unsubscribing', () => {
    const form = makeForm();
    const handle = watch(form, 'change', () => getValue(form, 'email'));
    const listener = vi.fn();
    const unsubscribe = handle.subscribe(listener);
    setValue(form, 'email', 'x@y.z');
    expect(listener).toHaveBeenCalledTimes(1);
    // A bare watch hears every 'change' emission — path scoping is
    // `subscribe({name})`'s job.
    setValue(form, 'count', 5);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setValue(form, 'email', 'nope@nope.no');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stores the fresh snapshot during wake when a comparator is given', () => {
    const form = makeForm();
    const getter = vi.fn(() => getValue(form, 'count'));
    const handle = watch(form, 'change', getter, (a, b) => a === b);
    expect(handle.getSnapshot()).toBe(0); // getter call 1
    handle.subscribe(() => {});
    setValue(form, 'count', 3); // wake: getter call 2, cache = 3
    expect(getter).toHaveBeenCalledTimes(2);
    // The unequal verdict stored the fresh snapshot up front: this read
    // needs no recompute.
    expect(handle.getSnapshot()).toBe(3);
    expect(getter).toHaveBeenCalledTimes(2);
  });

  it('skips the listener while the projection is equal (isEqual contract)', () => {
    const form = makeForm();
    // A wide getter returning a fresh reference per call; the comparator
    // judges by the `count` it carries.
    const handle = watch(
      form,
      'change',
      () => ({count: getValue(form, 'count'), fresh: {}}),
      (a, b) => a.count === b.count
    );
    const listener = vi.fn();
    handle.subscribe(listener);
    setValue(form, 'count', 7);
    expect(listener).toHaveBeenCalledTimes(1);
    // A heard change that keeps the projection equal never wakes the
    // subscriber.
    setValue(form, 'email', 'other@o.o');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(handle.getSnapshot().count).toBe(7);
  });

  it('payload-less broadcasts (reset) wake a bare watcher', () => {
    const form = makeForm();
    const handle = watch(form, 'change', () => getValue(form, 'email'));
    const listener = vi.fn();
    handle.subscribe(listener);
    setValue(form, 'email', 'dirty@d.d');
    expect(listener).toHaveBeenCalledTimes(1);
    // reset emits payload-less 'change' — the correctness fallback.
    reset(form);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(handle.getSnapshot()).toBe('a@b.c');
  });

  it('composes with useSyncExternalStore as a React adapter', () => {
    const form = makeForm();
    const handle = watch(form, 'change', () => getValue(form, 'email'));

    function Email() {
      const email = React.useSyncExternalStore(
        handle.subscribe,
        handle.getSnapshot,
        handle.getSnapshot
      );
      return React.createElement('output', {role: 'status'}, email);
    }

    render(React.createElement(Email));
    expect(screen.getByRole('status').textContent).toBe('a@b.c');
    act(() => {
      setValue(form, 'email', 'typed@t.t');
    });
    expect(screen.getByRole('status').textContent).toBe('typed@t.t');
  });
  it('dispose() removes the internal listener and every consumer', () => {
    const form = makeForm();
    const handle = watch(form, 'change', () => getValue(form, 'count'));
    const listener = vi.fn();
    handle.subscribe(listener);
    setValue(form, 'count', 1);
    expect(listener).toHaveBeenCalledTimes(1);
    handle.dispose();
    setValue(form, 'count', 2);
    expect(listener).toHaveBeenCalledTimes(1);
    // The dead handle reads its last cached value; it never recomputes.
    expect(handle.getSnapshot()).toBe(1);
  });
});
