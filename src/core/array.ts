import createPath from '../path';
import type {Path, PathSegments} from '../path';
import type {Form} from '../form';
import type {ArrayItemOf, FieldPath} from '../types';
import {getValueByPath, setValueByPath} from './values';

/** Framework-free array operations: the headless counterparts of
 * `useFieldArray`'s movers. Every operation reads the array at `path` and
 * lands the next array through {@link setValueByPath} — one whole-array
 * write. Guarded operations no-op on out-of-range indices and report the
 * outcome; a missing/non-array value reads as an empty array. */

/** Read the array at `path`, tolerating a missing or non-array branch. */
function readArray(form: Form, path: Path): any[] {
  const value = getValueByPath(form, path);
  return Array.isArray(value) ? value : [];
}

/** Append one value to the array at `path`. */
export function appendValueByPath(form: Form, path: Path, value: any): void {
  const arr = readArray(form, path);
  setValueByPath(form, path, [...arr, value]);
}

/** Prepend one value to the array at `path`. */
export function prependValueByPath(form: Form, path: Path, value: any): void {
  const arr = readArray(form, path);
  setValueByPath(form, path, [value, ...arr]);
}

/** Insert one value at `index` in the array at `path` (`index === length`
 * appends). Returns `false` — without touching the form — when the index
 * is out of range; `true` once the value landed. */
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

/** Remove one or several rows from the array at `path` in a single write.
 * Indices may repeat; out-of-range entries are ignored. Returns the
 * indices actually dropped, sorted descending so caller-side row-id
 * bookkeeping can splice them without re-indexing drift; `[]` when nothing
 * was removable. */
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

/** Move the row at `from` to `to` (rows in between shift one position).
 * Returns `false` — without touching the form — when either index is out
 * of range or they are equal; `true` once the row moved. */
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

/** Swap the rows at `from` and `to`. Returns `false` — without touching
 * the form — when either index is out of range or they are equal; `true`
 * once the rows swapped. */
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

/** Wholesale-replace the array at `path` (length may change) in one write. */
export function replaceValuesByPath(
  form: Form,
  path: Path,
  values: any[]
): void {
  setValueByPath(form, path, [...values]);
}

/** Overwrite one row of the array at `path` in place (a whole-array write,
 * so the row's position and every other row are untouched). Returns
 * `false` when the index is out of range; `true` once the value landed. */
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

/** Append one value to the array at `name`. */
export function appendValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, value: ArrayItemOf<T, P>): void {
  appendValueByPath(form, createPath(name), value);
}

/** Prepend one value to the array at `name`. See {@link appendValue}. */
export function prependValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, value: ArrayItemOf<T, P>): void {
  prependValueByPath(form, createPath(name), value);
}

/** Insert one value at `index` in the array at `name`. Returns `false` on
 * an out-of-range index (see {@link insertValueByPath}). */
export function insertValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, index: number, value: ArrayItemOf<T, P>): boolean {
  return insertValueByPath(form, createPath(name), index, value);
}

/** Remove one or several rows from the array at `name` in a single write.
 * Returns the indices actually dropped, descending (see
 * {@link removeValueByPath}). */
export function removeValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, indices: number | number[]): number[] {
  return removeValueByPath(form, createPath(name), indices);
}

/** Move the row at `from` to `to` in the array at `name`. Returns `false`
 * on an out-of-range or no-op move (see {@link moveValueByPath}). */
export function moveValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, from: number, to: number): boolean {
  return moveValueByPath(form, createPath(name), from, to);
}

/** Swap the rows at `from` and `to` in the array at `name`. Returns
 * `false` on an out-of-range or no-op swap (see {@link swapValuesByPath}). */
export function swapValues<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, from: number, to: number): boolean {
  return swapValuesByPath(form, createPath(name), from, to);
}

/** Wholesale-replace the array at `name` (see {@link replaceValuesByPath}). */
export function replaceValues<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, values: ArrayItemOf<T, P>[]): void {
  replaceValuesByPath(form, createPath(name), values);
}

/** Overwrite one row of the array at `name` in place. Returns `false` on
 * an out-of-range index (see {@link updateValueByPath}). */
export function updateValue<
  T extends Record<string, any> = any,
  P extends FieldPath<T> | PathSegments = FieldPath<T> | PathSegments
>(form: Form<T>, name: P, index: number, value: ArrayItemOf<T, P>): boolean {
  return updateValueByPath(form, createPath(name), index, value);
}
