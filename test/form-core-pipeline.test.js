// The framework-boundary litmus: the whole field pipeline — validator
// registration (debounce, sync gate, async lock), the mode/
// reValidateMode-gated user-change gate, blur/touched — must run from
// pure core calls, with no React (no useField, no useValidate) anywhere
// in this file. If a future change reintroduces a React closure as the
// authoritative implementation of any of these behaviors, these tests
// fail: a non-React adapter (Solid-style binding) must be able to drive
// a form headlessly through exactly the functions exercised here.
import {describe, it, expect, vi} from 'vitest';
import createForm, {
  changeValueByPath,
  getError,
  getValue,
  hasTouched,
  registerFieldMode,
  registerValidatorByPath,
  unregisterFieldMode,
  userBlur,
  userChangeByPath
} from '../src/form';
import createPath from '../src/path';

const required = v => (v ? undefined : 'required');

const register = (form, name, validate = required, extra = {}) =>
  registerValidatorByPath(form, createPath(name), {
    validate: () => validate,
    debounce: () => 0,
    sync: () => undefined,
    ...extra
  });

describe('core-only field pipeline', () => {
  it('registers a kick in form.validators and the disposer unregisters it', () => {
    const form = createForm({initialValues: {a: ''}});
    const dispose = register(form, 'a');

    form.validators.get(createPath('a').key)();
    expect(getError(form, 'a')).toEqual({type: 'custom', message: 'required'});

    dispose();
    expect(form.validators.has(createPath('a').key)).toBe(false);
  });

  it('userChangeByPath gates validation by the registered mode', () => {
    const modes = {
      onSubmit: 0,
      onBlur: 0,
      onChange: 1,
      all: 1
    };
    for (const [mode, kicks] of Object.entries(modes)) {
      const form = createForm({initialValues: {a: ''}});
      const validate = vi.fn(required);
      register(form, 'a', validate);
      const {token} = registerFieldMode(form, createPath('a'), mode);

      userChangeByPath(form, createPath('a'), 'x');
      expect(validate).toHaveBeenCalledTimes(kicks);

      unregisterFieldMode(form, createPath('a'), token);
    }
  });

  it("mode 'onTouched' validates on first blur then on every change", () => {
    const form = createForm({initialValues: {a: ''}});
    const validate = vi.fn(required);
    register(form, 'a', validate);
    registerFieldMode(form, createPath('a'), 'onTouched');

    userChangeByPath(form, createPath('a'), 'x');
    expect(validate).toHaveBeenCalledTimes(0);
    userBlur(form, createPath('a'));
    expect(validate).toHaveBeenCalledTimes(1);
    userChangeByPath(form, createPath('a'), 'y');
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('userBlur marks touched unconditionally and gates by onBlur', () => {
    const form = createForm({initialValues: {a: ''}});
    const validate = vi.fn(required);
    register(form, 'a', validate);
    registerFieldMode(form, createPath('a'), 'onBlur');

    userChangeByPath(form, createPath('a'), 'x');
    expect(validate).toHaveBeenCalledTimes(0);
    userBlur(form, createPath('a'));
    expect(validate).toHaveBeenCalledTimes(1);
    expect(hasTouched(form, 'a')).toBe(true);
  });

  it('reValidateMode onChange re-validates while the field carries a live error', () => {
    const form = createForm({initialValues: {a: ''}});
    let verdict = 'required';
    const validate = vi.fn(v => (v ? undefined : verdict));
    register(form, 'a', validate);
    registerFieldMode(form, createPath('a'), 'onSubmit');

    // Seed the error the way the default mode does: a failed "submit".
    form.validators.get(createPath('a').key)();
    expect(getError(form, 'a').message).toBe('required');
    validate.mockClear();
    verdict = undefined;

    userChangeByPath(form, createPath('a'), 'ok');
    expect(validate).toHaveBeenCalledTimes(1);
    expect(getError(form, 'a')).toBeUndefined();
    expect(getValue(form, 'a')).toBe('ok');
  });

  it('changeValueByPath rides the registered pipeline and falls back to a plain set', () => {
    const form = createForm({initialValues: {a: ''}});
    const validate = vi.fn(required);
    register(form, 'a', validate);
    const {token} = registerFieldMode(form, createPath('a'), 'onChange');

    changeValueByPath(form, createPath('a'), 'x');
    expect(validate).toHaveBeenCalledTimes(1);
    expect(getValue(form, 'a')).toBe('x');

    // No mounted field anymore: plain write, no kick.
    unregisterFieldMode(form, createPath('a'), token);
    validate.mockClear();
    changeValueByPath(form, createPath('a'), 'y');
    expect(validate).toHaveBeenCalledTimes(0);
    expect(getValue(form, 'a')).toBe('y');
  });

  it('the sync gate lands immediately and short-circuits the debounced validator', () => {
    const form = createForm({initialValues: {a: ''}});
    const validate = vi.fn(required);
    const sync = vi.fn(v => (v ? undefined : 'required-now'));
    register(form, 'a', validate, {sync: () => sync});

    form.validators.get(createPath('a').key)();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(0); // gate failed: skipped
    expect(getError(form, 'a').message).toBe('required-now');
  });

  it('merges kicks inside the debounce window and marks the pending wait', () => {
    vi.useFakeTimers();
    try {
      const form = createForm({initialValues: {a: ''}});
      const validate = vi.fn(required);
      register(form, 'a', validate, {debounce: () => 300});
      const kick = form.validators.get(createPath('a').key);

      kick();
      kick();
      kick();
      expect(validate).toHaveBeenCalledTimes(0);
      // trigger/ensureValidate wait out the pending window through the
      // validating mark.
      expect(form.validating.has(createPath('a').key)).toBe(true);

      vi.advanceTimersByTime(300);
      expect(validate).toHaveBeenCalledTimes(1);
      expect(form.validating.has(createPath('a').key)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('only the latest async round lands; stale results are dropped', async () => {
    const form = createForm({initialValues: {a: ''}});
    const resolvers = [];
    const validate = vi.fn(
      () => new Promise(resolve => resolvers.push(resolve))
    );
    register(form, 'a', validate);
    const kick = form.validators.get(createPath('a').key);

    kick(); // round 1, in flight
    kick(); // round 2 supersedes it
    expect(validate).toHaveBeenCalledTimes(2);
    expect(form.validating.has(createPath('a').key)).toBe(true);

    resolvers[1](undefined); // latest round lands clean
    await vi.waitFor(() =>
      expect(form.validating.has(createPath('a').key)).toBe(false)
    );

    resolvers[0]('stale'); // superseded round settles: dropped
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(getError(form, 'a')).toBeUndefined();
  });
});
