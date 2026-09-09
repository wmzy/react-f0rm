import {describe, it, expect} from 'vitest';
import {on} from '../../src/emitter';
import createForm, {
  getValues,
  getValue,
  isDirty,
  appendValue,
  prependValue,
  insertValue,
  removeValue,
  moveValue,
  swapValues,
  replaceValues,
  updateValue,
  appendValueByPath,
  insertValueByPath,
  removeValueByPath,
  moveValueByPath,
  swapValuesByPath,
  replaceValuesByPath,
  updateValueByPath
} from '../../src/form';
import createPath from '../../src/path';

function createItemsForm(items = ['a', 'b', 'c']) {
  return createForm({initialValues: {items}});
}

/** Record every 'change' emit payload while `fn` runs. */
function recordChanges(form, fn) {
  const payloads = [];
  const off = on(form.emitter, 'change', path => payloads.push(path));
  fn();
  off();
  return payloads;
}

describe('core array ops (framework-free movers)', () => {
  it('appendValue / prependValue add at the ends', () => {
    const form = createItemsForm();
    appendValue(form, 'items', 'd');
    prependValue(form, 'items', 'z');
    expect(getValues(form).items).toEqual(['z', 'a', 'b', 'c', 'd']);
  });

  it('appendValueByPath seeds a missing branch', () => {
    const form = createForm({initialValues: {}});
    appendValueByPath(form, createPath('items'), 'x');
    expect(getValues(form).items).toEqual(['x']);
  });

  it('a non-array branch reads as empty — an append replaces it with the array', () => {
    const form = createForm({initialValues: {items: {not: 'array'}}});
    appendValue(form, 'items', 'x');
    expect(getValues(form).items).toEqual(['x']);
  });

  it('insertValue lands at the index, length included', () => {
    const form = createItemsForm();
    expect(insertValue(form, 'items', 1, 'x')).toBe(true);
    expect(insertValue(form, 'items', 4, 'tail')).toBe(true);
    expect(getValues(form).items).toEqual(['a', 'x', 'b', 'c', 'tail']);
  });

  it('insertValue out of range is a silent no-op: no write, no emit', () => {
    const form = createItemsForm();
    const payloads = recordChanges(form, () => {
      expect(insertValue(form, 'items', -1, 'x')).toBe(false);
      expect(insertValue(form, 'items', 99, 'x')).toBe(false);
    });
    expect(getValues(form).items).toEqual(['a', 'b', 'c']);
    expect(payloads).toEqual([]);
  });

  it('removeValue drops a single index', () => {
    const form = createItemsForm();
    expect(removeValue(form, 'items', 1)).toEqual([1]);
    expect(getValues(form).items).toEqual(['a', 'c']);
  });

  it('removeValue drops a list in one write: unsorted, duplicates and out-of-range tolerated', () => {
    const form = createItemsForm(['a', 'b', 'c', 'd', 'e']);
    // 4 (in range), 1 twice, -1 and 9 out of range.
    expect(removeValue(form, 'items', [4, 1, 1, -1, 9])).toEqual([4, 1]);
    expect(getValues(form).items).toEqual(['a', 'c', 'd']);
  });

  it('removeValue with nothing removable returns [] and leaves the form untouched', () => {
    const form = createItemsForm();
    const payloads = recordChanges(form, () => {
      expect(removeValue(form, 'items', [9, -1])).toEqual([]);
      expect(removeValue(form, 'items', [])).toEqual([]);
    });
    expect(getValues(form).items).toEqual(['a', 'b', 'c']);
    expect(payloads).toEqual([]);
  });

  it('removeValueByPath on a missing branch is a no-op', () => {
    const form = createForm({initialValues: {}});
    expect(removeValueByPath(form, createPath('items'), 0)).toEqual([]);
    expect(getValues(form).items).toBeUndefined();
  });

  it('moveValue repositions a row and reports the outcome', () => {
    const form = createItemsForm();
    expect(moveValue(form, 'items', 0, 2)).toBe(true);
    expect(getValues(form).items).toEqual(['b', 'c', 'a']);
    expect(moveValue(form, 'items', 2, 0)).toBe(true);
    expect(getValues(form).items).toEqual(['a', 'b', 'c']);
  });

  it('moveValue out of range or equal indices is a silent no-op', () => {
    const form = createItemsForm();
    const payloads = recordChanges(form, () => {
      expect(moveValue(form, 'items', -1, 1)).toBe(false);
      expect(moveValue(form, 'items', 1, 9)).toBe(false);
      expect(moveValue(form, 'items', 1, 1)).toBe(false);
    });
    expect(getValues(form).items).toEqual(['a', 'b', 'c']);
    expect(payloads).toEqual([]);
  });

  it('swapValues exchanges two rows and reports the outcome', () => {
    const form = createItemsForm();
    expect(swapValues(form, 'items', 0, 2)).toBe(true);
    expect(getValues(form).items).toEqual(['c', 'b', 'a']);
  });

  it('swapValues out of range or equal indices is a silent no-op', () => {
    const form = createItemsForm();
    const payloads = recordChanges(form, () => {
      expect(swapValues(form, 'items', 0, 9)).toBe(false);
      expect(swapValues(form, 'items', 0, 0)).toBe(false);
    });
    expect(getValues(form).items).toEqual(['a', 'b', 'c']);
    expect(payloads).toEqual([]);
  });

  it('replaceValues swaps the whole array', () => {
    const form = createItemsForm();
    replaceValues(form, 'items', ['x', 'y', 'z', 'w']);
    expect(getValues(form).items).toEqual(['x', 'y', 'z', 'w']);
  });

  it('updateValue overwrites one row in place', () => {
    const form = createItemsForm();
    expect(updateValue(form, 'items', 1, 'B')).toBe(true);
    expect(getValues(form).items).toEqual(['a', 'B', 'c']);
  });

  it('updateValue out of range is a silent no-op', () => {
    const form = createItemsForm();
    const payloads = recordChanges(form, () => {
      expect(updateValue(form, 'items', 3, 'x')).toBe(false);
      expect(updateValue(form, 'items', -1, 'x')).toBe(false);
    });
    expect(getValues(form).items).toEqual(['a', 'b', 'c']);
    expect(payloads).toEqual([]);
  });

  it('every op emits a single path-scoped change at the array path', () => {
    const form = createItemsForm();
    for (const op of [
      () => appendValue(form, 'items', 'x'),
      () => prependValue(form, 'items', 'x'),
      () => insertValue(form, 'items', 0, 'x'),
      () => removeValue(form, 'items', 0),
      () => moveValue(form, 'items', 0, 1),
      () => swapValues(form, 'items', 0, 1),
      () => replaceValues(form, 'items', ['x']),
      () => updateValue(form, 'items', 0, 'x')
    ]) {
      const payloads = recordChanges(form, op);
      expect(payloads).toEqual([createPath('items')]);
    }
  });

  it('ops write the array layer: leaf reads follow the new rows', () => {
    const form = createItemsForm();
    replaceValues(form, 'items', [{n: 1}, {n: 2}]);
    expect(getValue(form, 'items[0].n')).toBe(1);
    moveValue(form, 'items', 0, 1);
    expect(getValue(form, 'items[0].n')).toBe(2);
    expect(getValue(form, 'items[1].n')).toBe(1);
  });

  it('ops count as edits: isDirty flips', () => {
    const form = createItemsForm();
    expect(isDirty(form)).toBe(false);
    appendValue(form, 'items', 'd');
    expect(isDirty(form)).toBe(true);
    expect(getValues(form).items).toEqual(['a', 'b', 'c', 'd']);
  });

  it('name and ByPath variants agree', () => {
    const form = createItemsForm();
    const path = createPath('items');
    insertValueByPath(form, path, 0, 'i');
    removeValueByPath(form, path, 2);
    moveValueByPath(form, path, 1, 0);
    swapValuesByPath(form, path, 0, 1);
    replaceValuesByPath(form, path, ['r']);
    updateValueByPath(form, path, 0, 'u');
    expect(getValues(form).items).toEqual(['u']);
  });
});
