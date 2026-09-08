import {subscribe} from '../../src/subscribe';

import {describe, it, expect, vi} from 'vitest';
import createForm, {
  setValue,
  setError,
  setErrorByPath,
  reset,
  setValidatingByPath,
  unsetValidatingByPath,
  setIsSubmitting,
  setDisabled,
  handleSubmit,
  trigger
} from '../../src/form';
import createPath from '../../src/path';

describe('subscribe', () => {
  it('invokes the callback when the watched path is written', () => {
    const form = createForm();
    const callback = vi.fn();
    subscribe(form, {name: 'city', callback});
    setValue(form, 'city', 'Hangzhou');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('ignores writes at unrelated paths', () => {
    const form = createForm();
    const callback = vi.fn();
    subscribe(form, {name: 'city', callback});
    setValue(form, 'province', 'Zhejiang');
    expect(callback).not.toHaveBeenCalled();
  });

  it('wakes a branch subscription on descendant writes', () => {
    const form = createForm();
    const callback = vi.fn();
    // Default scope is 'branch': subscribing to 'tags' covers 'tags.*'.
    subscribe(form, {name: 'tags', callback});
    setValue(form, ['tags', 0], 'a');
    setValue(form, 'tags', ['a', 'b']);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('leaf scope ignores descendant writes but not ancestor ones', () => {
    const form = createForm();
    const callback = vi.fn();
    subscribe(form, {name: ['tags', 0], scope: 'leaf', callback});
    setValue(form, ['tags', 1], 'b');
    expect(callback).not.toHaveBeenCalled();
    setValue(form, 'tags', ['a', 'b']);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('errors subscriptions match exact keys only', () => {
    const form = createForm();
    const callback = vi.fn();
    subscribe(form, {name: 'email', event: 'errors', callback});
    setError(form, 'name', 'Required');
    expect(callback).not.toHaveBeenCalled();
    setError(form, 'email', 'Invalid email');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('subscribes to every path in a name array', () => {
    const form = createForm();
    const callback = vi.fn();
    subscribe(form, {name: ['province', 'city'], callback});
    setValue(form, 'province', 'Zhejiang');
    setValue(form, 'city', 'Hangzhou');
    setValue(form, 'zip', '310000');
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('stops notifying once the unsubscribe function runs', () => {
    const form = createForm();
    const callback = vi.fn();
    const unsubscribe = subscribe(form, {
      name: ['province', 'city'],
      callback
    });
    setValue(form, 'province', 'Zhejiang');
    unsubscribe();
    setValue(form, 'city', 'Hangzhou');
    setValue(form, 'province', 'Jiangsu');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('fires on payload-less broadcasts (reset)', () => {
    const form = createForm({initialValues: {province: 'Zhejiang'}});
    const named = vi.fn();
    const unnamed = vi.fn();
    subscribe(form, {name: 'province', callback: named});
    subscribe(form, {callback: unnamed});
    reset(form);
    expect(named).toHaveBeenCalledTimes(1);
    expect(unnamed).toHaveBeenCalledTimes(1);
  });

  it('notifies named subscribers on payload-less submit events', () => {
    const form = createForm();
    const callback = vi.fn();
    subscribe(form, {name: 'email', event: 'submitting', callback});
    setIsSubmitting(form, true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('treats a number-bearing array as one segments path, not a name list', () => {
    const form = createForm();
    const callback = vi.fn();
    subscribe(form, {name: ['user', 0], event: 'errors', callback});
    // Would match a 'user' entry if the array were misread as name list.
    setError(form, 'user', 'Required');
    expect(callback).not.toHaveBeenCalled();
    setError(form, ['user', 0], 'Required');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('validating subscriptions wake on the watched path only', async () => {
    vi.useFakeTimers();
    try {
      const form = createForm();
      const callback = vi.fn();
      subscribe(form, {name: 'email', event: 'validating', callback});
      const email = createPath('email');
      const name = createPath('name');
      form.validators.set(email.key, () => {
        setValidatingByPath(form, email);
        setTimeout(() => {
          setErrorByPath(form, email, 'taken');
          unsetValidatingByPath(form, email);
        }, 10);
      });
      form.validators.set(name.key, () => {
        setValidatingByPath(form, name);
        setTimeout(() => unsetValidatingByPath(form, name), 10);
      });

      // A sibling field's round emits 'validating' with the name path;
      // path matching (like 'change') keeps the email subscriber asleep.
      trigger(form, 'name');
      expect(callback).not.toHaveBeenCalled();

      // email's own round emits 'validating' when it starts and again
      // when it settles — both carry the email path, both wake it.
      const pending = trigger(form, 'email');
      await vi.advanceTimersByTimeAsync(10);
      await pending;
      expect(callback).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('validating subscriptions without a name hear reset broadcasts', () => {
    const form = createForm();
    const callback = vi.fn();
    subscribe(form, {event: 'validating', callback});
    reset(form);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('notifies named subscribers on payload-less disabled broadcasts', () => {
    const form = createForm();
    const callback = vi.fn();
    subscribe(form, {name: 'email', event: 'disabled', callback});
    setDisabled(form, true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('notifies named subscribers on payload-less submitSuccessful events', async () => {
    const form = createForm({initialValues: {email: 'a@b.c'}});
    const callback = vi.fn();
    subscribe(form, {name: 'email', event: 'submitSuccessful', callback});
    await handleSubmit(form, {onSubmit: () => {}})();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
