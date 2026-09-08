import {describe, it, expect} from 'vitest';
import createForm, {
  setValue,
  setTouched,
  isDirty,
  getDirtyFields,
  getTouchedFields,
  removeField,
  setInitialValues,
  reset,
  resetField,
  getFieldState
} from '../../src/form';

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

  it('reset drops committed baselines', () => {
    const form = createForm({initialValues: {a: '1'}});
    setValue(form, 'a', '2', {shouldDirty: false});
    reset(form, {a: '9'});
    // The old commit no longer suppresses dirtiness against the new
    // baseline: '2' differs from '9'.
    setValue(form, 'a', '2');
    expect(getDirtyFields(form)).toEqual({a: true});
  });

  it('setInitialValues drops committed baselines', () => {
    const form = createForm({initialValues: {a: '1'}});
    setValue(form, 'a', '2', {shouldDirty: false});
    setInitialValues(form, {a: '9'});
    setValue(form, 'a', '2');
    expect(getDirtyFields(form)).toEqual({a: true});
  });

  it('resetField drops the field’s committed baseline', () => {
    const form = createForm({initialValues: {a: '1'}});
    setValue(form, 'a', '3', {shouldDirty: false});
    resetField(form, 'a', {value: '3'});
    // Baseline cleared: the live '3' compares against initial '1' again.
    expect(getFieldState(form, 'a').isDirty).toBe(true);
  });

  it('removeField drops the field’s committed baseline', () => {
    const form = createForm({initialValues: {a: '1'}});
    setValue(form, 'a', '2', {shouldDirty: false});
    removeField(form, 'a');
    setValue(form, 'a', '2');
    expect(getDirtyFields(form)).toEqual({a: true});
  });

  it('a wholesale write at an ancestor drops committed baselines beneath it', () => {
    const form = createForm({initialValues: {tags: ['a', 'b']}});
    setValue(form, ['tags', 1], 'B', {shouldDirty: false});
    expect(getDirtyFields(form)).toEqual({});
    // Array movers rewrite the parent path; the row-level commit died with
    // the subtree it was committed against, and the wholesale write also
    // supersedes the row's live key (a later ancestor write replaces the
    // subtree), so dirtiness reports at the array alone: the new array
    // differs from initialValues, and no phantom row entry survives from
    // the replaced generation.
    setValue(form, 'tags', ['a', 'B2']);
    expect(getDirtyFields(form)).toEqual({tags: true});
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
