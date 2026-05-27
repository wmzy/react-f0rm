import {describe, it, expect} from 'vitest';
import createPath from '../src/path';

describe('createPath', () => {
  it('creates path from string', () => {
    const path = createPath('name');
    expect(path.value).toEqual(['name']);
    expect(path.key).toBe('["name"]');
  });

  it('creates path from dot-notation string', () => {
    const path = createPath('user.name');
    expect(path.value).toEqual(['user', 'name']);
    expect(path.key).toBe('["user","name"]');
  });

  it('creates path from bracket notation', () => {
    const path = createPath('items[0]');
    expect(path.value).toEqual(['items', 0]);
    expect(path.key).toBe('["items",0]');
  });

  it('creates path from nested bracket notation', () => {
    const path = createPath('items[0].name');
    expect(path.value).toEqual(['items', 0, 'name']);
    expect(path.key).toBe('["items",0,"name"]');
  });

  it('creates path from array', () => {
    const path = createPath(['user', 'email']);
    expect(path.value).toEqual(['user', 'email']);
    expect(path.key).toBe('["user","email"]');
  });

  it('creates path from array with numbers', () => {
    const path = createPath(['items', 0, 'name']);
    expect(path.value).toEqual(['items', 0, 'name']);
    expect(path.key).toBe('["items",0,"name"]');
  });

  it('returns equal objects for same array input', () => {
    const arr = ['user', 'name'];
    const path1 = createPath(arr);
    const path2 = createPath(arr);
    expect(path1).toEqual(path2);
  });

  it('returns equal objects for different arrays with same content', () => {
    const path1 = createPath(['user', 'name']);
    const path2 = createPath(['user', 'name']);
    expect(path1).toEqual(path2);
  });
});
