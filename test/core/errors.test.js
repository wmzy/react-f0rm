import {describe, it, expect, vi} from 'vitest';
import {on} from '../../src/emitter';
import createForm, {
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
  setServerErrors,
  getErrorsRecord,
  fieldPathToDottedKey,
  dottedKeyToFieldPath
} from '../../src/form';
import createPath from '../../src/path';

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

  it('treats an empty string as "no error" and clears what is stored', () => {
    const form = createForm();
    setError(form, 'name', 'required');
    setError(form, 'name', '');
    expect(getError(form, 'name')).toBeUndefined();
    expect(getFieldErrors(form, 'name')).toEqual([]);
  });

  it('emits focusError with shouldFocus after the error lands', () => {
    const form = createForm();
    const focused = [];
    const unsubscribe = on(form.emitter, 'focusError', key => {
      focused.push(key);
    });
    setError(form, 'name', 'required', {shouldFocus: true});
    expect(focused).toEqual([JSON.stringify(['name'])]);
    // Without the option no focus is emitted.
    setError(form, 'name', 'other');
    expect(focused).toHaveLength(1);
    unsubscribe();
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

describe('fieldPathToDottedKey / dottedKeyToFieldPath', () => {
  it('converts bracket spelling to the dotted record key', () => {
    expect(fieldPathToDottedKey('items[0].name')).toBe('items.0.name');
    expect(fieldPathToDottedKey('user.name')).toBe('user.name');
    // Quoted segments drop their quotes like the parser does.
    expect(fieldPathToDottedKey('items["0"]')).toBe('items.0');
  });

  it('accepts segment arrays', () => {
    expect(fieldPathToDottedKey(['a', 0, 'b'])).toBe('a.0.b');
  });

  it('converts dotted record keys back to bracket spelling', () => {
    expect(dottedKeyToFieldPath('items.0.name')).toBe('items[0].name');
    expect(dottedKeyToFieldPath('items.10.name')).toBe('items[10].name');
    expect(dottedKeyToFieldPath('user.name')).toBe('user.name');
    expect(dottedKeyToFieldPath('tags.0')).toBe('tags[0]');
  });

  it('round-trips between the two spellings', () => {
    for (const name of ['a.b.c', 'items[0].name', 'items[0].sub[1]']) {
      expect(dottedKeyToFieldPath(fieldPathToDottedKey(name))).toBe(name);
    }
  });

  it('reads getErrorsRecord entries through the translated key', () => {
    const form = createForm();
    setError(form, 'items[0].name', 'required');
    const record = getErrorsRecord(form);
    expect(record['items.0.name']).toEqual([
      {type: 'custom', message: 'required'}
    ]);
    expect(record[fieldPathToDottedKey('items[0].name')]).toBe(
      record['items.0.name']
    );
    expect(getError(form, dottedKeyToFieldPath('items.0.name'))).toEqual({
      type: 'custom',
      message: 'required'
    });
  });
});
