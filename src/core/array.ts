import createPath from '../path';
import type {Path, PathSegments} from '../path';
import type {Form} from '../form';
import type {ArrayItemOf, FieldPath} from '../types';
import {getValueByPath, setValueByPath} from './values';

/**
 * Framework-free array operations on a form's values: the headless
 * counterparts of `useFieldArray`'s movers (which are thin wrappers
 * around these, adding only their row-id bookkeeping). Every operation
 * reads the array at `path`, computes the next array immutably and lands
 * it through {@link setValueByPath} — one whole-array write at the
 * array's own path, so descendant keys never go stale and subscribers
 * scoped to the branch re-sync exactly like on any array rewrite.
 *
 * Guarded operations are silent no-ops on out-of-range indices — the same
 * convention `useFieldArray`'s `update` has always kept — and report the
 * outcome so callers that keep parallel bookkeeping (row ids, say) can
 * mirror exactly what moved: `true`/`false` for the single-mutation
 * movers, the dropped indices (descending) for removals.
 *
 * A missing or non-array value at `path` reads as an empty array: appends
 * seed it, guards no-op, and a wholesale `replace` overwrites whatever
 * was there — the historical `useFieldArray` semantics.
 */

/** Read the array at `path`, tolerating a missing or non-array branch. */
function readArray(form: Form, path: Path): any[] {
  const value = getValueByPath(form, path);
  return Array.isArray(value) ? value : [];
}

/**
 * Append one value to the array at `path`.
 *
 * @param form
 * @param path
 * @param value
 */
export function appendValueByPath(form: Form, path: Path, value: any): void {
  const arr = readArray(form, path);
  setValueByPath(form, path, [...arr, value]);
}

/**
 * Prepend one value to the array at `path`.
 *
 * @param form
 * @param path
 * @param value
 */
export function prependValueByPath(form: Form, path: Path, value: any): void {
  const arr = readArray(form, path);
  setValueByPath(form, path, [value, ...arr]);
}

/**
 * Insert one value at `index` in the array at `path` (`index === length`
 * appends). Returns `false` — without touching the form — when the index
 * is out of range; `true` once the value landed.
 *
 * @param form
 * @param path
 * @param index
 * @param value
 */
export function insertValueByPath(
  form: Form,
  path: Path,
  index: number,
  value: any
): boolean {
  const arr = readArray(form, path);
  if (index < 0 || index > arr.length) return false;
  setValueByPath(form, path, [
    ...arr.slice(0, index),
    value,
    ...arr.slice(index)
  ]);
  return true;
}

/**
 * Remove one or several rows from the array at `path` in a single write.
 * Indices may come in any order and may repeat — each row drops once;
 * out-of-range entries are ignored. Returns the indices actually dropped,
 * sorted descending so caller-side bookkeeping (row ids) can splice them
 * out without re-indexing drift; `[]` when nothing was removable.
 *
 * @param form
 * @param path
 * @param indices a single index or a list of indices
 */
export function removeValueByPath(
  form: Form,
  path: Path,
  indices: number | number[]
): number[] {
  const arr = readArray(form, path);
  const drop = new Set<number>();
  for (const index of Array.isArray(indices) ? indices : [indices]) {
    if (index >= 0 && index < arr.length) drop.add(index);
  }
  if (drop.size === 0) return [];
  const dropped = [...drop].sort((a, b) => b - a);
  setValueByPath(
    form,
    path,
    arr.filter((_, i) => !drop.has(i))
  );
  return dropped;
}

/**
 * Move the row at `from` to `to` (every row in between shifts one
 * position). Returns `false` — without touching the form — when either
 * index is out of range or they are equal; `true` once the row moved.
 *
 * @param form
 * @param path
 * @param from
 * @param to
 */
export function moveValueByPath(
  form: Form,
  path: Path,
  from: number,
  to: number
): boolean {
  const arr = readArray(form, path);
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) {
    return false;
  }
  if (from === to) return false;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  setValueByPath(form, path, next);
  return true;
}

/**
 * Swap the rows at `from` and `to`. Returns `false` — without touching
 * the form — when either index is out of range or they are equal; `true`
 * once the rows swapped.
 *
 * @param form
 * @param path
 * @param from
 * @param to
 */
export function swapValuesByPath(
  form: Form,
  path: Path,
  from: number,
  to: number
): boolean {
  const arr = readArray(form, path);
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) {
    return false;
  }
  if (from === to) return false;
  const next = [...arr];
  [next[from], next[to]] = [next[to], next[from]];
  setValueByPath(form, path, next);
  return true;
}

/**
 * Wholesale-replace the array at `path` (length may change) in one write.
 *
 * @param form
 * @param path
 * @param values the new array
 */
export function replaceValuesByPath(
  form: Form,
  path: Path,
  values: any[]
): void {
  setValueByPath(form, path, [...values]);
}

/**
 * Overwrite one row of the array at `path` in place (a whole-array write,
 * so the row's position and every other row are untouched). Returns
 * `false` — without touching the form — when the index is out of range;
 * `true` once the value landed.
 *
 * @param form
 * @param path
 * @param index
 * @param value
 */
export function updateValueByPath(
  form: Form,
  path: Path,
  index: number,
  value: any
): boolean {
  const arr = readArray(form, path);
  if (index < 0 || index >= arr.length) return false;
  const next = [...arr];
  next[index] = value;
  setValueByPath(form, path, next);
  return true;
}

/**
 * Append one value to the array at `name`. With a typed form the value is
 * checked against the array's element type (`ArrayItemOf<T, P>`).
 *
 * @param form
 * @param name
 * @param value
 */
export function appendValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, value: ArrayItemOf<T, P>): void {
  appendValueByPath(form, createPath(name), value);
}

/**
 * Prepend one value to the array at `name`. See {@link appendValue}.
 *
 * @param form
 * @param name
 * @param value
 */
export function prependValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, value: ArrayItemOf<T, P>): void {
  prependValueByPath(form, createPath(name), value);
}

/**
 * Insert one value at `index` in the array at `name`. Returns `false` on
 * an out-of-range index (see {@link insertValueByPath}).
 *
 * @param form
 * @param name
 * @param index
 * @param value
 */
export function insertValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, index: number, value: ArrayItemOf<T, P>): boolean {
  return insertValueByPath(form, createPath(name), index, value);
}

/**
 * Remove one or several rows from the array at `name` in a single write.
 * Returns the indices actually dropped, descending (see
 * {@link removeValueByPath}).
 *
 * @param form
 * @param name
 * @param indices a single index or a list of indices
 */
export function removeValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, indices: number | number[]): number[] {
  return removeValueByPath(form, createPath(name), indices);
}

/**
 * Move the row at `from` to `to` in the array at `name`. Returns `false`
 * on an out-of-range or no-op move (see {@link moveValueByPath}).
 *
 * @param form
 * @param name
 * @param from
 * @param to
 */
export function moveValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, from: number, to: number): boolean {
  return moveValueByPath(form, createPath(name), from, to);
}

/**
 * Swap the rows at `from` and `to` in the array at `name`. Returns
 * `false` on an out-of-range or no-op swap (see {@link swapValuesByPath}).
 *
 * @param form
 * @param name
 * @param from
 * @param to
 */
export function swapValues<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, from: number, to: number): boolean {
  return swapValuesByPath(form, createPath(name), from, to);
}

/**
 * Wholesale-replace the array at `name` (see {@link replaceValuesByPath}).
 *
 * @param form
 * @param name
 * @param values the new array
 */
export function replaceValues<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, values: ArrayItemOf<T, P>[]): void {
  replaceValuesByPath(form, createPath(name), values);
}

/**
 * Overwrite one row of the array at `name` in place. Returns `false` on
 * an out-of-range index (see {@link updateValueByPath}).
 *
 * @param form
 * @param name
 * @param index
 * @param value
 */
export function updateValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, index: number, value: ArrayItemOf<T, P>): boolean {
  return updateValueByPath(form, createPath(name), index, value);
}
