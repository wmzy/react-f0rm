import {describe, it, expect} from 'vitest';
import {get, set, isEmpty, isPromise} from '../src/util';

describe('get', () => {
  it('gets a value at a simple path', () => {
    const obj = {a: 1};
    expect(get(obj, ['a'])).toBe(1);
  });

  it('gets a nested value', () => {
    const obj = {a: {b: {c: 3}}};
    expect(get(obj, ['a', 'b', 'c'])).toBe(3);
  });

  it('returns undefined for missing path', () => {
    const obj = {a: 1};
    expect(get(obj, ['b'])).toBeUndefined();
  });

  it('returns undefined for deeply missing path', () => {
    const obj = {a: {b: 1}};
    expect(get(obj, ['a', 'x', 'y'])).toBeUndefined();
  });

  it('handles array indices', () => {
    const obj = {items: [10, 20, 30]};
    expect(get(obj, ['items', 1])).toBe(20);
  });

  it('returns undefined for null intermediate value', () => {
    const obj = {a: null};
    expect(get(obj, ['a', 'b'])).toBeUndefined();
  });
});

describe('set', () => {
  it('sets a value at a simple path', () => {
    const result = set({a: 1}, ['a'], 2);
    expect(result).toEqual({a: 2});
  });

  it('sets a nested value immutably', () => {
    const obj = {a: {b: 1}};
    const result = set(obj, ['a', 'b'], 2);
    expect(result).toEqual({a: {b: 2}});
    expect(obj.a.b).toBe(1); // original unchanged
  });

  it('creates intermediate objects', () => {
    const result = set({}, ['a', 'b', 'c'], 1);
    expect(result).toEqual({a: {b: {c: 1}}});
  });

  it('handles array indices', () => {
    const result = set({items: [1, 2, 3]}, ['items', 1], 99);
    expect(result).toEqual({items: [1, 99, 3]});
  });

  it('creates arrays when index is number', () => {
    const result = set({}, ['items', 0], 'a');
    expect(result).toEqual({items: ['a']});
  });
});

describe('isEmpty', () => {
  it('returns true for null/undefined', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });

  it('returns true for empty object', () => {
    expect(isEmpty({})).toBe(true);
  });

  it('returns true for empty array', () => {
    expect(isEmpty([])).toBe(true);
  });

  it('returns false for non-empty string', () => {
    expect(isEmpty('hello')).toBe(false);
  });

  it('returns true for object with all empty values', () => {
    expect(isEmpty({a: null, b: undefined})).toBe(true);
  });

  it('returns false for object with non-empty values', () => {
    expect(isEmpty({a: 1})).toBe(false);
  });
});

describe('isPromise', () => {
  it('returns true for promises', () => {
    expect(isPromise(Promise.resolve())).toBe(true);
  });

  it('returns true for thenables', () => {
    expect(isPromise({then: () => {}})).toBe(true);
  });

  it('returns false for non-promises', () => {
    expect(isPromise(null)).toBeFalsy();
    expect(isPromise(undefined)).toBeFalsy();
    expect(isPromise(42)).toBeFalsy();
    expect(isPromise('string')).toBeFalsy();
    expect(isPromise({})).toBeFalsy();
  });
});
