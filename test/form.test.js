import {describe, it, expect, vi} from 'vitest';
import {on} from '@for-fun/event-emitter';
import createForm, {
  getValue,
  setValue,
  getValueByPath,
  setValueByPath,
  getError,
  getErrorByPath,
  getFieldErrors,
  getFieldErrorsByPath,
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
  getDirtyFields,
  getTouchedFields,
  removeField,
  setInitialValues,
  reset,
  getValues,
  ensureValidate,
  setValidatingByPath,
  unsetValidatingByPath,
  setIsSubmitting,
  incrementSubmitCount,
  setSubmitSuccessful,
  setDisabled,
  handleSubmit,
  trigger,
  setFocus,
  resetField,
  getFieldState,
  setServerErrors,
  VALIDATION_OUTCOME
} from '../src/form';
import {subscribe} from '../src/subscribe';
import createPath from '../src/path';

describe('createForm', () => {
  it('creates a form instance', () => {
    const form = createForm();
    expect(form.values).toBeInstanceOf(Map);
    expect(form.errors).toBeInstanceOf(Map);
    expect(form.touched).toBeInstanceOf(Set);
    expect(form.validators).toBeInstanceOf(Map);
    expect(form.validating).toBeInstanceOf(Set);
    expect(form.mode).toBe('onSubmit');
    expect(form.reValidateMode).toBe('onChange');
    expect(form.disabled).toBe(false);
  });

  it('merges options', () => {
    const form = createForm({
      initialValues: {name: 'test'},
      mode: 'onTouched',
      reValidateMode: 'onBlur',
      disabled: true
    });
    expect(form.initialValues).toEqual({name: 'test'});
    expect(form.mode).toBe('onTouched');
    expect(form.reValidateMode).toBe('onBlur');
    expect(form.disabled).toBe(true);
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

  it('does not validate or touch without options', () => {
    const form = createForm({initialValues: {}});
    form.validators.set(createPath('name').key, () => {
      setErrorByPath(form, createPath('name'), 'required');
    });
    setValue(form, 'name', '');
    expect(getValue(form, 'name')).toBe('');
    expect(getError(form, 'name')).toBeUndefined();
    expect(hasTouched(form, 'name')).toBe(false);
  });

  it('runs only the field validator with shouldValidate', () => {
    const form = createForm({initialValues: {}});
    const other = vi.fn();
    form.validators.set(createPath('name').key, () => {
      setErrorByPath(form, createPath('name'), 'required');
    });
    form.validators.set(createPath('email').key, other);
    setValue(form, 'name', '', {shouldValidate: true});
    expect(getError(form, 'name')).toEqual({
      type: 'custom',
      message: 'required'
    });
    expect(other).not.toHaveBeenCalled();
  });

  it('marks the field touched with shouldTouch', () => {
    const form = createForm({initialValues: {}});
    setValue(form, 'name', 'x', {shouldTouch: true});
    expect(hasTouched(form, 'name')).toBe(true);
  });

  it('accepts shouldDirty as a no-op without throwing', () => {
    const form = createForm({initialValues: {}});
    expect(() =>
      setValue(form, 'name', 'x', {shouldDirty: true})
    ).not.toThrow();
    expect(getValue(form, 'name')).toBe('x');
  });

  it('applies options through setValueByPath too', () => {
    const form = createForm({initialValues: {}});
    const path = createPath('name');
    form.validators.set(path.key, () => {
      setErrorByPath(form, path, 'required');
    });
    setValueByPath(form, path, '', {shouldValidate: true, shouldTouch: true});
    expect(getError(form, 'name')).toEqual({
      type: 'custom',
      message: 'required'
    });
    expect(hasTouched(form, 'name')).toBe(true);
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

  it('returns the initialValues reference itself when no field is set', () => {
    const initialValues = {a: 1};
    const form = createForm({initialValues});
    expect(getValues(form)).toBe(initialValues);
  });

  it('later ancestor write supersedes earlier descendant writes', () => {
    const form = createForm({initialValues: {}});
    setValue(form, 'a.b', 1);
    setValue(form, 'a', {c: 2});
    expect(getValues(form)).toEqual({a: {c: 2}});
  });

  it('later descendant write merges into an earlier ancestor write', () => {
    const form = createForm({initialValues: {}});
    setValue(form, 'a', {b: 1, keep: true});
    setValue(form, 'a.b', 2);
    expect(getValues(form)).toEqual({a: {b: 2, keep: true}});
  });

  it('returns a fresh merged tree per call (no result caching)', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'b', 2);
    const first = getValues(form);
    const second = getValues(form);
    expect(first).not.toBe(second);
    first.b = 'mutated';
    expect(getValues(form)).toEqual({a: 1, b: 2});
    expect(form.initialValues).toEqual({a: 1});
  });

  it('flows the form type to the returned record (typed context)', () => {
    // Type context, checked by tsc in TS consumers: createForm infers
    // Form<{a: string}>, so getValues(form) is that record and .a is a
    // string — the generic threads T through instead of returning any.
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    expect(getValues(form).a).toBe('typed');
  });
});

describe('getError / setError', () => {
  it('gets and sets a field error', () => {
    const form = createForm();
    setError(form, 'name', 'required');
    expect(getError(form, 'name')).toEqual({
      type: 'custom',
      message: 'required'
    });
  });

  it('normalizes a string error to {type: "custom", message}', () => {
    const form = createForm();
    const path = createPath('name');
    setErrorByPath(form, path, 'required');
    expect(getErrorByPath(form, path)).toEqual({
      type: 'custom',
      message: 'required'
    });
  });

  it('stores FieldError objects as-is', () => {
    const form = createForm();
    const error = {type: 'required', message: 'Name is required'};
    setError(form, 'name', error);
    expect(getError(form, 'name')).toBe(error);
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

  it('stores an array of errors; getError returns the first, getFieldErrors all', () => {
    const form = createForm();
    setError(form, 'name', ['too short', {type: 'required', message: 'nope'}]);
    expect(getError(form, 'name')).toEqual({
      type: 'custom',
      message: 'too short'
    });
    expect(getFieldErrors(form, 'name')).toEqual([
      {type: 'custom', message: 'too short'},
      {type: 'required', message: 'nope'}
    ]);
  });

  it('drops falsy items when storing an array of errors', () => {
    const form = createForm();
    setErrorByPath(form, createPath('name'), ['', undefined, 'required']);
    expect(getFieldErrors(form, 'name')).toEqual([
      {type: 'custom', message: 'required'}
    ]);
  });

  it('clears error when set to an empty array', () => {
    const form = createForm();
    setError(form, 'name', 'required');
    setError(form, 'name', []);
    expect(getError(form, 'name')).toBeUndefined();
    expect(hasErrors(form)).toBe(false);
  });

  it('getFieldErrorsByPath returns an empty array when no error', () => {
    const form = createForm();
    expect(getFieldErrorsByPath(form, createPath('name'))).toEqual([]);
  });
});

describe('setServerErrors', () => {
  it('lands string values as a single type:server error', () => {
    const form = createForm();
    setServerErrors(form, {email: 'has already been taken'});
    expect(getError(form, 'email')).toEqual({
      type: 'server',
      message: 'has already been taken'
    });
  });

  it('lands string arrays as multiple errors in order (RealWorld shape)', () => {
    const form = createForm();
    setServerErrors(form, {
      email: ['has already been taken', 'is invalid']
    });
    expect(getFieldErrors(form, 'email')).toEqual([
      {type: 'server', message: 'has already been taken'},
      {type: 'server', message: 'is invalid'}
    ]);
  });

  it('clears pre-existing errors by default', () => {
    const form = createForm();
    setError(form, 'email', 'client error');
    setError(form, 'other', 'unrelated');
    setServerErrors(form, {email: ['taken']});
    expect(getError(form, 'email')).toEqual({type: 'server', message: 'taken'});
    expect(getError(form, 'other')).toBeUndefined();
  });

  it('keeps pre-existing errors with keepExisting', () => {
    const form = createForm();
    setError(form, 'email', 'client error');
    setError(form, 'other', 'unrelated');
    setServerErrors(form, {email: ['taken']}, {keepExisting: true});
    expect(getError(form, 'email')).toEqual({type: 'server', message: 'taken'});
    expect(getError(form, 'other')).toEqual({
      type: 'custom',
      message: 'unrelated'
    });
  });

  it('an empty array clears that field', () => {
    const form = createForm();
    setError(form, 'email', 'client error');
    setServerErrors(form, {email: []});
    expect(hasErrors(form)).toBe(false);
  });

  it('emits errors events so subscribers re-render', () => {
    const form = createForm();
    const listener = vi.fn();
    on(form.emitter, 'errors', listener);
    setServerErrors(form, {email: ['taken'], password: 'too short'});
    // clearErrors broadcast + one emit per field
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('getErrors / getFirstError / clearErrors / hasErrors', () => {
  it('getErrors returns {path, type, message} entries', () => {
    const form = createForm();
    setError(form, 'a', 'error a');
    setError(form, 'b', 'error b');
    expect(getErrors(form)).toEqual([
      {path: 'a', type: 'custom', message: 'error a'},
      {path: 'b', type: 'custom', message: 'error b'}
    ]);
  });

  it('getErrors uses dotted paths and keeps object error types', () => {
    const form = createForm();
    setError(form, ['user', 'name'], {type: 'required', message: 'nope'});
    setError(form, ['list', 0], 'required');
    expect(getErrors(form)).toEqual([
      {path: 'user.name', type: 'required', message: 'nope'},
      {path: 'list.0', type: 'custom', message: 'required'}
    ]);
  });

  it('getFirstError returns the first error message', () => {
    const form = createForm();
    setError(form, 'a', 'first');
    expect(getFirstError(form)).toBe('first');
  });

  it('getErrors emits one entry per error of the same path, in order', () => {
    const form = createForm();
    setError(form, 'a', ['first', 'second']);
    setError(form, 'b', 'error b');
    expect(getErrors(form)).toEqual([
      {path: 'a', type: 'custom', message: 'first'},
      {path: 'a', type: 'custom', message: 'second'},
      {path: 'b', type: 'custom', message: 'error b'}
    ]);
  });

  it('getFirstError returns the first error of the first key', () => {
    const form = createForm();
    setError(form, 'a', ['first', 'second']);
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

  it('clearErrors(name) clears only that field', () => {
    const form = createForm();
    setError(form, 'a', 'error a');
    setError(form, 'b', 'error b');
    clearErrors(form, 'a');
    expect(getError(form, 'a')).toBeUndefined();
    expect(getError(form, 'b')).toEqual({type: 'custom', message: 'error b'});
    expect(hasErrors(form)).toBe(true);
  });

  it('clearErrors accepts segment-array paths and name lists', () => {
    const form = createForm();
    setError(form, 'a', 'error a');
    setError(form, ['user', 'name'], 'required');
    setError(form, 'c', 'error c');
    clearErrors(form, [['user', 'name'], 'c']);
    expect(getError(form, ['user', 'name'])).toBeUndefined();
    expect(getError(form, 'c')).toBeUndefined();
    expect(getError(form, 'a')).toEqual({type: 'custom', message: 'error a'});
    // A segment array containing a number is one path, not a list.
    setError(form, ['list', 0], 'required');
    clearErrors(form, ['list', 0]);
    expect(getError(form, ['list', 0])).toBeUndefined();
    expect(getError(form, 'a')).toEqual({type: 'custom', message: 'error a'});
  });

  it('clearErrors(name) emits errors scoped to the path; no-arg stays global', () => {
    const form = createForm();
    setError(form, 'a', 'error a');
    setError(form, 'b', 'error b');
    const seen = [];
    on(form.emitter, 'errors', path => seen.push(path?.key ?? null));
    clearErrors(form, 'a');
    expect(seen).toEqual(['["a"]']);
    clearErrors(form);
    expect(seen).toEqual(['["a"]', null]);
    expect(hasErrors(form)).toBe(false);
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
    const form = createForm({initialValues: {name: 'test'}});
    setValue(form, 'email', 'test@example.com');
    expect(isDirty(form)).toBe(true);
  });

  it('getDirtyFields returns empty object initially', () => {
    const form = createForm({initialValues: {a: '1', b: '2'}});
    expect(getDirtyFields(form)).toEqual({});
  });

  it('getDirtyFields contains only changed fields', () => {
    const form = createForm({initialValues: {a: '1', b: '2'}});
    setValue(form, 'a', 'changed');
    expect(getDirtyFields(form)).toEqual({a: true});
  });

  it('getDirtyFields uses dotted keys for nested and array paths', () => {
    const form = createForm({
      initialValues: {user: {name: 'x'}, list: ['a']}
    });
    setValue(form, ['user', 'name'], 'y');
    setValue(form, ['list', 0], 'b');
    setValue(form, ['list', 1], 'c');
    expect(getDirtyFields(form)).toEqual({
      'user.name': true,
      'list.0': true,
      'list.1': true
    });
  });

  it('getDirtyFields returns the same reference when nothing changed', () => {
    const form = createForm({initialValues: {a: '1', b: '2'}});
    expect(getDirtyFields(form)).toBe(getDirtyFields(form));
  });

  it('getDirtyFields keeps the cached reference across changes that do not alter the dirty set', () => {
    const form = createForm({initialValues: {a: '1'}});
    const first = getDirtyFields(form);
    setValue(form, 'a', '1');
    expect(getDirtyFields(form)).toBe(first);
  });

  it('getDirtyFields returns a new reference with the new dirty set', () => {
    const form = createForm({initialValues: {a: '1'}});
    const empty = getDirtyFields(form);
    setValue(form, 'a', 'changed');
    const dirty = getDirtyFields(form);
    expect(dirty).not.toBe(empty);
    expect(dirty).toEqual({a: true});
  });

  it('getDirtyFields returns the empty object after values revert to initial', () => {
    const form = createForm({initialValues: {a: '1'}});
    setValue(form, 'a', 'changed');
    expect(getDirtyFields(form)).toEqual({a: true});
    setValue(form, 'a', '1');
    const reverted = getDirtyFields(form);
    expect(reverted).toEqual({});
    expect(getDirtyFields(form)).toBe(reverted);
  });

  it('getTouchedFields returns dotted paths of touched fields', () => {
    const form = createForm({initialValues: {}});
    setTouched(form, 'a');
    setTouched(form, ['user', 'name']);
    expect(getTouchedFields(form)).toEqual(['a', 'user.name']);
  });

  it('getTouchedFields returns empty array initially', () => {
    const form = createForm({initialValues: {}});
    expect(getTouchedFields(form)).toEqual([]);
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

  it('tombstones the path so it does not fall back to initialValues', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    removeField(form, 'a');
    expect(getValue(form, 'a')).toBeUndefined();
    const values = getValues(form);
    expect(values).toEqual({});
    expect('a' in values).toBe(false);
    // getValues must not corrupt initialValues while merging.
    expect(form.initialValues).toEqual({a: 'initial'});
  });

  it('a tombstone is overwritten by a later setValue', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    removeField(form, 'a');
    setValue(form, 'a', 'new');
    expect(getValue(form, 'a')).toBe('new');
    expect(getValues(form)).toEqual({a: 'new'});
  });

  it('a tombstone never shadows a live parent value (array rewrite)', () => {
    const form = createForm({initialValues: {items: ['a', 'b', 'c']}});
    setValue(form, 'items', ['b', 'c']);
    // Item fields unmount after the array rewrite; their tombstones must
    // not punch holes in the live array.
    removeField(form, 'items.0');
    removeField(form, 'items.1');
    expect(getValues(form)).toEqual({items: ['b', 'c']});
  });

  it('rewriting a parent path supersedes stale child tombstones', () => {
    const form = createForm({initialValues: {items: ['a', 'b', 'c']}});
    setValue(form, 'items.2', 'typed');
    removeField(form, 'items.0');
    removeField(form, 'items.1');
    setValue(form, 'items', ['b', 'c']);
    expect(getValues(form)).toEqual({items: ['b', 'c']});
  });

  it('writing a descendant path clears an ancestor tombstone', () => {
    const form = createForm({initialValues: {o: {p: 1}}});
    removeField(form, 'o');
    setValue(form, 'o.p', 2);
    expect(getValues(form)).toEqual({o: {p: 2}});
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

  it('clears removal tombstones', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    removeField(form, 'a');
    setInitialValues(form, {a: 'updated'});
    expect(getValue(form, 'a')).toBe('updated');
    expect(getValues(form)).toEqual({a: 'updated'});
  });

  it('no-ops on an equal-content inline literal (committed edits survive)', () => {
    // The editor-page hazard: every render passes a fresh object with the
    // same content. Without the structural early return each re-render
    // cleared the values Map and reverted the user's typing.
    const form = createForm({initialValues: {a: 1, list: ['x']}});
    setValue(form, 'a', 99);
    const spy = vi.fn();
    on(form.emitter, 'change', spy);
    setInitialValues(form, {a: 1, list: ['x']});
    expect(spy).not.toHaveBeenCalled();
    expect(form.initialValues).toEqual({a: 1, list: ['x']});
    expect(getValue(form, 'a')).toBe(99);
  });

  it('keeps parsedValues when content is equal', async () => {
    // The early return must leave the schema-parse baseline intact — only
    // a genuine baseline swap drops it.
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({[VALIDATION_OUTCOME]: true, values: {a: 2}})
    });
    await ensureValidate(form);
    expect(form.parsedValues).toEqual({a: 2});
    setInitialValues(form, {a: 1});
    expect(form.parsedValues).toEqual({a: 2});
  });

  it('treats exotic objects as unequal (errs on re-seeding)', () => {
    // Class instances never compare structurally equal, so a new instance
    // re-seeds like the pre-guard behavior.
    class Box {
      constructor(v) {
        this.v = v;
      }
    }
    const form = createForm({initialValues: new Box(1)});
    const spy = vi.fn();
    on(form.emitter, 'change', spy);
    setInitialValues(form, new Box(1));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('still re-seeds and clears live values when content changed', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 99);
    setInitialValues(form, {a: 2});
    expect(getValue(form, 'a')).toBe(2);
    expect(getValues(form)).toEqual({a: 2});
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

  it('resets submission state and clears validating', () => {
    const form = createForm();
    setIsSubmitting(form, true);
    incrementSubmitCount(form);
    incrementSubmitCount(form);
    setSubmitSuccessful(form, true);
    const path = createPath('name');
    setValidatingByPath(form, path);
    reset(form);
    expect(form.isSubmitting).toBe(false);
    expect(form.submitCount).toBe(0);
    expect(form.isSubmitSuccessful).toBeUndefined();
    expect(form.validating.size).toBe(0);
  });

  it('emits validating and submission events on reset', () => {
    const form = createForm();
    incrementSubmitCount(form);
    setValidatingByPath(form, createPath('name'));
    const seen = [];
    [
      'validating',
      'submitting',
      'submitCount',
      'submitSuccessful',
      'reset'
    ].forEach(event => on(form.emitter, event, () => seen.push(event)));
    reset(form);
    expect(seen).toEqual([
      'validating',
      'submitting',
      'submitCount',
      'submitSuccessful',
      'reset'
    ]);
  });

  it('clears removal tombstones', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    removeField(form, 'a');
    reset(form, {a: 'fresh'});
    expect(getValue(form, 'a')).toBe('fresh');
    expect(getValues(form)).toEqual({a: 'fresh'});
  });

  it('keeps dirty values with keepDirtyValues', () => {
    const form = createForm({initialValues: {a: 1, b: 2}});
    setValue(form, 'a', 9);
    reset(form, {a: 1, b: 3}, {keepDirtyValues: true});
    // `a` was dirty against the pre-reset initialValues, so its live value
    // survives; clean `b` falls back to the new initialValues.
    expect(getValue(form, 'a')).toBe(9);
    expect(getValue(form, 'b')).toBe(3);
    expect(getValues(form)).toEqual({a: 9, b: 3});
    expect(getDirtyFields(form)).toEqual({a: true});
  });

  it('keepDirtyValues leaves clean fields on the new initialValues', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 1); // stored, but equal → not dirty
    reset(form, {a: 2}, {keepDirtyValues: true});
    expect(getValue(form, 'a')).toBe(2);
    expect(isDirty(form)).toBe(false);
  });

  it('keeps touched state with keepTouched', () => {
    const form = createForm();
    setTouched(form, 'name');
    reset(form, undefined, {keepTouched: true});
    expect(hasTouched(form, 'name')).toBe(true);
    expect(isTouched(form)).toBe(true);
  });

  it('keeps errors with keepErrors', () => {
    const form = createForm();
    setError(form, 'name', 'error');
    reset(form, undefined, {keepErrors: true});
    expect(getError(form, 'name')).toEqual({type: 'custom', message: 'error'});
    expect(hasErrors(form)).toBe(true);
  });

  it('keeps submission state with keepIsSubmitted, keepSubmitCount and keepIsSubmitting', () => {
    const form = createForm();
    setIsSubmitting(form, true);
    incrementSubmitCount(form);
    incrementSubmitCount(form);
    setSubmitSuccessful(form, true);
    reset(form, undefined, {
      keepIsSubmitted: true,
      keepSubmitCount: true,
      keepIsSubmitting: true
    });
    expect(form.isSubmitting).toBe(true);
    expect(form.submitCount).toBe(2);
    expect(form.isSubmitSuccessful).toBe(true);
  });
});

describe('resetField', () => {
  it('resets the field to initialValues and leaves siblings alone', () => {
    const form = createForm({initialValues: {a: 'initial', b: 'keep'}});
    setValue(form, 'a', 'changed');
    setValue(form, 'b', 'edited');
    resetField(form, 'a');
    expect(getValue(form, 'a')).toBe('initial');
    expect(getValue(form, 'b')).toBe('edited');
    expect(form.values.size).toBe(1);
  });

  it('clears the reset field dirtiness', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 2);
    expect(getDirtyFields(form)).toEqual({a: true});
    resetField(form, 'a');
    expect(isDirty(form)).toBe(false);
    expect(getDirtyFields(form)).toEqual({});
  });

  it('value option writes an explicit value without falling back', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'changed');
    resetField(form, 'a', {value: 'explicit'});
    expect(getValue(form, 'a')).toBe('explicit');
    expect(getDirtyFields(form)).toEqual({a: true});
  });

  it('value option wins over parsedValues', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({[VALIDATION_OUTCOME]: true, values: {a: 2}})
    });
    await ensureValidate(form);
    resetField(form, 'a', {value: 3});
    expect(getValue(form, 'a')).toBe(3);
  });

  it('keepTouched preserves the touched flag', () => {
    const form = createForm({initialValues: {a: 1}});
    setTouched(form, 'a');
    resetField(form, 'a', {keepTouched: true});
    expect(hasTouched(form, 'a')).toBe(true);
    resetField(form, 'a');
    expect(hasTouched(form, 'a')).toBe(false);
  });

  it('keepErrors preserves the field errors', () => {
    const form = createForm({initialValues: {a: 1}});
    setError(form, 'a', 'bad');
    resetField(form, 'a', {keepErrors: true});
    expect(getError(form, 'a')).toEqual({type: 'custom', message: 'bad'});
    resetField(form, 'a');
    expect(getError(form, 'a')).toBeUndefined();
  });

  it('removes the path from parsedValues so it falls back to initialValues', async () => {
    const form = createForm({
      initialValues: {a: 1, b: 1},
      validate: () => ({[VALIDATION_OUTCOME]: true, values: {a: 2, b: 2}})
    });
    await ensureValidate(form);
    expect(getValue(form, 'a')).toBe(2);
    resetField(form, 'a');
    expect(form.parsedValues).toEqual({b: 2}); // path removed, not shadowed
    expect(getValue(form, 'a')).toBe(1); // falls back to initialValues
    expect(getValue(form, 'b')).toBe(2); // sibling keeps its parsed value
    expect(getValues(form)).toEqual({a: 1, b: 2});
  });

  it('revives removal tombstones (inverse of removeField)', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'changed');
    removeField(form, 'a');
    expect(getValue(form, 'a')).toBeUndefined(); // tombstone blocks fallback
    resetField(form, 'a');
    expect(getValue(form, 'a')).toBe('initial'); // tombstone revived
  });

  it('emits change payload-less like removeField', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 2);
    const changes = [];
    on(form.emitter, 'change', path => changes.push(path ?? null));
    resetField(form, 'a');
    expect(changes).toEqual([null]);
  });

  it('emits touched and errors with the field path when that state drops', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 2);
    setTouched(form, 'a');
    setError(form, 'a', 'bad');
    const events = [];
    on(form.emitter, 'touched', path => events.push(['touched', path?.key]));
    on(form.emitter, 'errors', path => events.push(['errors', path?.key]));
    resetField(form, 'a');
    expect(events).toEqual([
      ['touched', '["a"]'],
      ['errors', '["a"]']
    ]);
  });
});

describe('getFieldState', () => {
  it('aggregates value, error, errors, dirty, touched and validating', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'changed');
    setError(form, 'a', ['first', 'second']);
    setTouched(form, 'a');
    setValidatingByPath(form, createPath('a'));
    expect(getFieldState(form, 'a')).toEqual({
      value: 'changed',
      error: {type: 'custom', message: 'first'},
      errors: [
        {type: 'custom', message: 'first'},
        {type: 'custom', message: 'second'}
      ],
      isDirty: true,
      isTouched: true,
      isValidating: true
    });
  });

  it('isDirty follows the getDirtyFields rule per field', () => {
    const form = createForm({initialValues: {a: 1, b: 2}});
    setValue(form, 'a', 1); // live value equal to initial: clean
    setValue(form, 'b', 3); // differs: dirty
    expect(getFieldState(form, 'a').isDirty).toBe(false);
    expect(getFieldState(form, 'b').isDirty).toBe(true);
    expect(getFieldState(form, 'missing').isDirty).toBe(false);
    expect(getDirtyFields(form)).toEqual({b: true});
  });

  it('isDirty compares against initialValues even when parsedValues differ', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({[VALIDATION_OUTCOME]: true, values: {a: 2}})
    });
    await ensureValidate(form);
    const state = getFieldState(form, 'a');
    expect(state.value).toBe(2); // layered read sees the parsed value
    expect(state.isDirty).toBe(false); // parsing is not an edit
  });

  it('errors is the shared stored array, read-only by contract', () => {
    const form = createForm();
    setError(form, 'a', 'bad');
    expect(getFieldState(form, 'a').errors).toBe(getFieldErrors(form, 'a'));
    expect(getFieldState(form, 'missing').errors).toEqual([]);
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

describe('setDisabled', () => {
  it('writes the flag and emits a payload-less disabled event', () => {
    const form = createForm();
    const listener = vi.fn();
    on(form.emitter, 'disabled', listener);

    setDisabled(form, true);
    expect(form.disabled).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setDisabled(form, false);
    expect(form.disabled).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('emits on every call, like the other submission setters', () => {
    const form = createForm({disabled: true});
    const listener = vi.fn();
    on(form.emitter, 'disabled', listener);

    setDisabled(form, true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(form.disabled).toBe(true);
  });
});

describe('handleSubmit', () => {
  it('runs the full state machine without an event object', async () => {
    const form = createForm({initialValues: {name: 'test'}});
    const seen = [];
    const submit = handleSubmit(form, {
      onSubmit: values => {
        seen.push(form.isSubmitting, values);
      }
    });

    await expect(submit()).resolves.toBeUndefined();

    expect(seen).toEqual([true, {name: 'test'}]);
    expect(form.isSubmitting).toBe(false);
    expect(form.submitCount).toBe(1);
    expect(form.isSubmitSuccessful).toBe(true);
  });

  it('passes native constraint failures from currentTarget to onInvalidSubmit', async () => {
    const form = createForm({initialValues: {email: ''}});
    const onInvalidSubmit = vi.fn();
    const onValidSubmit = vi.fn();
    const reportValidity = vi.fn();
    const preventDefault = vi.fn();
    const currentTarget = {
      reportValidity,
      checkValidity: () => false,
      elements: [
        {
          name: '["email"]',
          checkValidity: () => false,
          validationMessage: 'Please fill out this field.'
        },
        {
          name: '["age"]',
          checkValidity: () => true,
          validationMessage: ''
        }
      ]
    };

    const submit = handleSubmit(form, {onValidSubmit, onInvalidSubmit});
    await submit({preventDefault, currentTarget});

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(reportValidity).toHaveBeenCalledTimes(1);
    expect(onInvalidSubmit).toHaveBeenCalledTimes(1);
    expect(onInvalidSubmit).toHaveBeenCalledWith(
      [{path: 'email', type: 'native', message: 'Please fill out this field.'}],
      {email: ''}
    );
    expect(onValidSubmit).not.toHaveBeenCalled();
    expect(form.isSubmitting).toBe(false);
    expect(form.isSubmitSuccessful).toBe(false);
    expect(form.submitCount).toBe(1);
  });

  it('skips native validation when currentTarget has no checkValidity', async () => {
    const form = createForm({initialValues: {name: 'x'}});
    const onValidSubmit = vi.fn();
    const currentTarget = {elements: []};

    const submit = handleSubmit(form, {onValidSubmit});
    await submit({currentTarget});

    expect(onValidSubmit).toHaveBeenCalledWith({name: 'x'}, expect.anything());
    expect(form.isSubmitSuccessful).toBe(true);
  });

  it('passes custom validate errors to onInvalidSubmit', async () => {
    const form = createForm({
      initialValues: {name: ''},
      validate: values => (values.name ? {} : {name: 'name required'})
    });
    const onInvalidSubmit = vi.fn();
    const onValidSubmit = vi.fn();

    const submit = handleSubmit(form, {onValidSubmit, onInvalidSubmit});
    await submit();

    expect(onInvalidSubmit).toHaveBeenCalledWith(
      [{path: 'name', type: 'custom', message: 'name required'}],
      {name: ''}
    );
    expect(onValidSubmit).not.toHaveBeenCalled();
    expect(form.isSubmitting).toBe(false);
    expect(form.isSubmitSuccessful).toBe(false);
  });

  it('swallows onSubmit errors into isSubmitSuccessful=false', async () => {
    const form = createForm();
    const onValidSubmit = vi.fn();
    const submit = handleSubmit(form, {
      onSubmit: () => {
        throw new Error('boom');
      },
      onValidSubmit
    });

    await expect(submit()).resolves.toBeUndefined();

    expect(onValidSubmit).not.toHaveBeenCalled();
    expect(form.isSubmitSuccessful).toBe(false);
    expect(form.isSubmitting).toBe(false);
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
});

describe('setFocus', () => {
  it('emits focusError with the field path key', () => {
    const form = createForm();
    const listener = vi.fn();
    on(form.emitter, 'focusError', listener);

    setFocus(form, 'email');

    expect(listener).toHaveBeenCalledWith('["email"]');
  });

  it('normalizes segments paths to the same key shape as bound fields', () => {
    const form = createForm();
    const listener = vi.fn();
    on(form.emitter, 'focusError', listener);

    setFocus(form, ['items', 0, 'qty']);

    expect(listener).toHaveBeenCalledWith('["items",0,"qty"]');
  });

  it('passes options as a backward-compatible second argument', () => {
    const form = createForm();
    const listener = vi.fn();
    on(form.emitter, 'focusError', listener);

    setFocus(form, 'email', {shouldSelect: true});

    expect(listener).toHaveBeenCalledWith('["email"]', {shouldSelect: true});
  });

  it('still reaches single-argument subscribers when no options are given', () => {
    const form = createForm();
    // The pre-setFocus subscriber shape: only the path key is declared.
    const calls = [];
    on(form.emitter, 'focusError', key => calls.push(key));

    setFocus(form, 'name');

    expect(calls).toEqual(['["name"]']);
  });

  it('does not throw for names with no subscriber', () => {
    const form = createForm();
    expect(() => setFocus(form, 'missing')).not.toThrow();
  });
});

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
});
