import {describe, it, expect} from 'vitest';
import {
  get,
  set,
  setOwned,
  unset,
  isEmpty,
  isEqual,
  isPromise,
  normalizePath,
  pathCacheSize,
  waitUntil
} from '../src/util';
import createForm, {setValue} from '../src/form';

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

describe('normalizePath', () => {
  it('parses dot notation', () => {
    expect(normalizePath('a.b')).toEqual(['a', 'b']);
  });

  it('parses bare bracket identifier as string', () => {
    expect(normalizePath('a[b]')).toEqual(['a', 'b']);
  });

  it('parses bare bracket number as number', () => {
    expect(normalizePath('a[0]')).toEqual(['a', 0]);
  });

  it('parses negative bracket number as number', () => {
    expect(normalizePath('a[-1]')).toEqual(['a', -1]);
  });

  it('parses consecutive bracket indices', () => {
    expect(normalizePath('a[0][1]')).toEqual(['a', 0, 1]);
  });

  it('parses mixed bracket and dot notation', () => {
    expect(normalizePath('a[0].b')).toEqual(['a', 0, 'b']);
  });

  it('does not split dots inside double quotes', () => {
    expect(normalizePath('a["b.c"]')).toEqual(['a', 'b.c']);
  });

  it('does not split dots inside single quotes', () => {
    expect(normalizePath("a['b.c']")).toEqual(['a', 'b.c']);
  });

  it('keeps brackets inside quoted segments verbatim', () => {
    expect(normalizePath('a["b[0]"]')).toEqual(['a', 'b[0]']);
  });

  it('returns array input as-is', () => {
    const arr = ['a', 0];
    expect(normalizePath(arr)).toBe(arr);
  });

  it('caches parsed paths by string identity', () => {
    expect(normalizePath('user.name.first')).toBe(
      normalizePath('user.name.first')
    );
  });

  it('does not confuse cached lookalike paths', () => {
    expect(normalizePath('a.b')).toEqual(['a', 'b']);
    expect(normalizePath('a[0]')).toEqual(['a', 0]);
  });

  it('throws TypeError for unterminated bracket', () => {
    expect(() => normalizePath('a[0')).toThrow(TypeError);
  });

  it('throws TypeError for unterminated quote', () => {
    expect(() => normalizePath('a["b')).toThrow(TypeError);
  });

  it('throws TypeError for missing bracket after quoted segment', () => {
    expect(() => normalizePath('a["b"')).toThrow(TypeError);
  });

  // —— pathCache 上界（FIFO 1e4）——
  // 动态拼 key（'items[' + id + ']' 类字符串）会让模块级缓存永久增长；
  // 静态字段名场景几乎不增长，上界只是动态 key 的兜底。

  it('caps the path cache at 1e4 entries (FIFO) for dynamic keys', () => {
    for (let i = 0; i < 11000; i++) {
      normalizePath(`dynamic[${i}].name`);
    }
    expect(pathCacheSize()).toBe(10000);
  });

  it('reparses evicted paths to equal results and re-caches them', () => {
    const first = normalizePath('items[42].label');
    expect(normalizePath('items[42].label')).toBe(first); // 命中缓存
    // 把它挤出有界缓存，再重新解析
    for (let i = 0; i < 10001; i++) {
      normalizePath(`flush[${i}]`);
    }
    const second = normalizePath('items[42].label');
    expect(second).not.toBe(first); // 旧引用已舍弃，走重新解析
    expect(second).toEqual(first); // 行为等价：结果一致
    expect(normalizePath('items[42].label')).toBe(second); // 重新命中
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

describe('setOwned', () => {
  it('produces the same tree as chaining set for plain paths', () => {
    const seed = {a: 1, keep: true};
    const owned = new Set();
    let merged = setOwned(seed, ['b', 'c'], 2, owned);
    merged = setOwned(merged, ['a'], 9, owned);
    expect(merged).toEqual({a: 9, keep: true, b: {c: 2}});
    expect(seed).toEqual({a: 1, keep: true}); // borrowed containers untouched
  });

  it('later ancestor write replaces earlier descendant writes', () => {
    const owned = new Set();
    let merged = setOwned({}, ['a', 'b'], 1, owned);
    merged = setOwned(merged, ['a'], {c: 2}, owned);
    expect(merged).toEqual({a: {c: 2}});
  });

  it('later descendant write merges into an earlier ancestor write', () => {
    const owned = new Set();
    let merged = setOwned({}, ['a'], {b: 1, keep: true}, owned);
    merged = setOwned(merged, ['a', 'b'], 2, owned);
    expect(merged).toEqual({a: {b: 2, keep: true}});
  });

  it('copies borrowed containers exactly like set', () => {
    const seed = {items: ['a'], user: {name: 'x'}};
    const owned = new Set();
    let merged = setOwned(seed, ['items', 1], 'b', owned);
    merged = setOwned(merged, ['user', 'name'], 'y', owned);
    expect(merged).toEqual({items: ['a', 'b'], user: {name: 'y'}});
    expect(merged.items).not.toBe(seed.items);
    expect(merged.user).not.toBe(seed.user);
    expect(seed).toEqual({items: ['a'], user: {name: 'x'}});
  });

  it('reuses containers the merge already created', () => {
    const seed = {a: {b: {}}};
    const owned = new Set();
    const first = setOwned(seed, ['a', 'b', 'c'], 1, owned);
    const second = setOwned(first, ['a', 'b', 'd'], 2, owned);
    expect(second).toBe(first); // root copied once, then mutated in place
    expect(second).toEqual({a: {b: {c: 1, d: 2}}});
    expect(seed).toEqual({a: {b: {}}});
  });

  it('follows set copy rules for numeric and string props', () => {
    // set() discards a non-array container under a numeric prop and spreads
    // an array into an object under a string prop; setOwned must match both.
    expect(setOwned({a: {x: 1}}, ['a', 0, 'b'], 'v', new Set())).toEqual(
      set({a: {x: 1}}, ['a', 0, 'b'], 'v')
    );
    expect(setOwned({arr: ['a']}, ['arr', 'k'], 'v', new Set())).toEqual(
      set({arr: ['a']}, ['arr', 'k'], 'v')
    );
  });

  it('matches chained set over a mixed path list', () => {
    const entries = [
      [['a'], {x: 1}],
      [['a', 'b'], 2],
      [['list', 0], 'i'],
      [['list', 2], 'k'],
      [['list'], ['z']],
      [['list', 0], 'w'],
      [['deep', 'p', 'q', 'r'], 3]
    ];
    const seed = {a: 1, list: ['a'], deep: {p: 1}};
    let expected = seed;
    for (const [p, v] of entries) expected = set(expected, p, v);
    const owned = new Set();
    let actual = seed;
    for (const [p, v] of entries) actual = setOwned(actual, p, v, owned);
    expect(actual).toEqual(expected);
    expect(seed).toEqual({a: 1, list: ['a'], deep: {p: 1}});
  });

  it('returns the value for an empty path', () => {
    expect(setOwned({a: 1}, [], 'replacement', new Set())).toBe('replacement');
  });
});

describe('unset', () => {
  it('removes a top-level key immutably', () => {
    const obj = {a: 1, b: 2};
    expect(unset(obj, ['a'])).toEqual({b: 2});
    expect(obj).toEqual({a: 1, b: 2});
  });

  it('removes a nested key and keeps untouched branches shared', () => {
    const obj = {a: {b: 1, keep: true}, other: 'x'};
    const result = unset(obj, ['a', 'b']);
    expect(result).toEqual({a: {keep: true}, other: 'x'});
    expect(result.other).toBe(obj.other); // sibling branch not copied
    expect(obj.a.b).toBe(1); // source tree untouched
  });

  it('returns the source when a nested removal changes nothing', () => {
    const obj = {a: {b: 1}};
    // Removing a missing nested key leaves the branch identical.
    expect(unset(obj, ['a', 'missing'])).toBe(obj);
  });

  it('deletes array slots without shrinking the array', () => {
    const result = unset(['x', 'y'], [1]);
    expect(result.length).toBe(2);
    expect(0 in result).toBe(true);
    expect(1 in result).toBe(false);
  });

  it('returns the same array when the index is missing', () => {
    const arr = [1];
    expect(unset(arr, [3])).toBe(arr);
  });

  it('returns the input for non-object holders and empty paths', () => {
    expect(unset('str', ['a'])).toBe('str');
    expect(unset(null, ['a'])).toBe(null);
    expect(unset(undefined, ['a'])).toBe(undefined);
    const obj = {a: 1};
    expect(unset(obj, [])).toBe(obj);
  });
});

describe('isEqual', () => {
  it('compares dates by time, not identity', () => {
    expect(isEqual(new Date(0), new Date(0))).toBe(true);
    expect(isEqual(new Date(0), new Date(1))).toBe(false);
    expect(isEqual(new Date(0), {})).toBe(false);
  });

  it('rejects cross-kind operands', () => {
    expect(isEqual('a', ['a'])).toBe(false);
    expect(isEqual(['a'], {0: 'a'})).toBe(false);
    expect(isEqual(1, {})).toBe(false);
    expect(isEqual(null, {})).toBe(false);
    expect(isEqual(undefined, undefined)).toBe(true); // Object.is fast path
  });

  it('compares arrays element-wise and by length', () => {
    expect(isEqual([1, [2, {a: 3}]], [1, [2, {a: 3}]])).toBe(true);
    expect(isEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(isEqual([1, 2], [1, 3])).toBe(false);
  });

  it('compares plain objects recursively and by key count', () => {
    expect(isEqual({a: {b: 1}}, {a: {b: 1}})).toBe(true);
    expect(isEqual({a: 1}, {a: 2})).toBe(false);
    expect(isEqual({a: 1, b: 2}, {a: 1})).toBe(false);
  });

  it('treats non-plain prototypes as unequal', () => {
    class Box {
      constructor(v) {
        this.v = v;
      }
    }
    expect(isEqual(new Box(1), new Box(1))).toBe(false);
    expect(isEqual(new Box(1), {v: 1})).toBe(false);
    expect(isEqual(Object.create(null), {})).toBe(false);
  });
});

describe('waitUntil', () => {
  it('resolves immediately when the condition already holds', async () => {
    const {emitter} = createForm();
    await expect(
      waitUntil(
        emitter,
        'change',
        () => true,
        () => false
      )
    ).resolves.toBeUndefined();
  });

  it('rejects immediately when the reject condition already holds', async () => {
    const {emitter} = createForm();
    await expect(
      waitUntil(
        emitter,
        'change',
        () => false,
        () => true
      )
    ).rejects.toBeUndefined();
  });

  it('stays subscribed through events that do not satisfy the condition', async () => {
    const form = createForm({initialValues: {name: ''}});
    let ready = false;
    const promise = waitUntil(
      form.emitter,
      'change',
      () => ready,
      () => false
    );
    setValue(form, 'name', 'not yet'); // condition false: keep waiting
    await Promise.resolve();
    ready = true;
    setValue(form, 'name', 'ready');
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects when the reject condition turns true on an event', async () => {
    const form = createForm({initialValues: {name: ''}});
    let dead = false;
    const promise = waitUntil(
      form.emitter,
      'change',
      () => false,
      () => dead
    );
    setValue(form, 'name', 'x'); // still alive: keep waiting
    await Promise.resolve();
    dead = true;
    setValue(form, 'name', 'dead');
    await expect(promise).rejects.toBeUndefined();
  });
});
