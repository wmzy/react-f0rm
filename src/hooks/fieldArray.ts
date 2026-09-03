import {useCallback, useContext, useEffect, useReducer, useRef} from 'react';
import type {Context} from 'react';
import {FormContext} from '../context';
import {getValueByPath, setValueByPath} from '../form';
import type {FieldError, Form, Name} from '../form';
import {onPathEvent} from '../subscribe';
import {useFieldErrorsByPath} from './form';
import usePath from './path';
import useStage, {useStageFn} from './stage';

/** Per-form row-id counter. A module-level counter would grow across
 * every form on the page — and, on the server, across requests (ids like
 * `_4701` after a day of SSR). Keyed weakly so it dies with the form. */
const idCounters = new WeakMap<Form, number>();

function generateId(form: Form): string {
  const next = (idCounters.get(form) ?? 0) + 1;
  idCounters.set(form, next);
  return `_${next}`;
}

/**
 * Live `id -> index` tables shared between {@link useFieldArray} and
 * {@link useFieldArrayItem}: one ids array per (form, array key), keyed
 * weakly so it dies with the form. The array is the hook's own `idsRef`
 * reference (mutated in place by the movers), so items always read the
 * latest order without owning a subscription of their own.
 */
const arrayIdsRegistry = new WeakMap<Form, Map<string, string[]>>();

function getArrayIds(form: Form, key: string): string[] | undefined {
  return arrayIdsRegistry.get(form)?.get(key);
}

function registerArrayIds(form: Form, key: string, ids: string[]): void {
  let registry = arrayIdsRegistry.get(form);
  if (!registry) {
    registry = new Map();
    arrayIdsRegistry.set(form, registry);
  }
  registry.set(key, ids);
}

/** Stable identity for the render-count reducer below: never recreated,
 * so the dispatch path stays referentially clean. */
function bumpReducer(count: number): number {
  return count + 1;
}

interface FieldArrayItem {
  id: string;
  index: number;
}

export interface UseFieldArrayResult {
  fields: FieldArrayItem[];
  append: (value: any) => void;
  prepend: (value: any) => void;
  insert: (index: number, value: any) => void;
  remove: (index: number) => void;
  swap: (from: number, to: number) => void;
  move: (from: number, to: number) => void;
  replace: (values: any[]) => void;
  update: (index: number, value: any) => void;
}

/**
 * Shared core of {@link useFieldArray} and the per-instance hook returned by
 * `createFormContext()`: identical behavior, but the form is resolved from
 * whichever Context instance is passed in instead of the module-level one.
 */
export function useFieldArrayCore(
  options: {name: Name; form?: Form},
  Context: Context<any>
): UseFieldArrayResult {
  // Read the context unconditionally (hook call order must be stable), then
  // let an explicitly passed form win — works without a <FormProvider>.
  const contextForm = useContext(Context);
  const form = options.form || contextForm;
  if (!form) throw new Error('no form provided');
  const path = usePath(options.name);
  const idsRef = useRef<string[]>([]);

  const getArray = useCallback(
    (): any[] => getValueByPath(form, path) || [],
    [form, path]
  );

  const setArray = useCallback(
    (arr: any[]) => {
      setValueByPath(form, path, arr);
    },
    [form, path]
  );

  const computeFields = useCallback(() => {
    const arr = getArray();
    while (idsRef.current.length < arr.length) {
      idsRef.current.push(generateId(form));
    }
    while (idsRef.current.length > arr.length) {
      idsRef.current.pop();
    }
    return idsRef.current.map((id, index) => ({id, index}));
  }, [getArray, form]);

  // Subscribe to 'change' events scoped to this array's branch: the array
  // key itself, its ancestors (an ancestor write replaces what the leaf
  // read falls back to) and its descendants (item edits), so typing into
  // unrelated fields does not re-render the array component. Payload-less
  // 'change' emits (reset, setInitialValues) always sync, and a field
  // unmounting inside the branch fires through the descendant match. The
  // comma-separated key prefix comparison lives in onPathEvent,
  // which keeps lookalike sibling keys ('["tagsX"]') from matching.
  const [fields, syncFields] = useReducer(
    computeFields,
    undefined,
    computeFields
  );
  useEffect(
    () => onPathEvent(form.emitter, 'change', path, 'branch', syncFields),
    [form.emitter, path]
  );

  // Publish the live ids array so per-item hooks (useFieldArrayItem) can
  // resolve id -> index. Registered during render — not only in an effect —
  // so items rendered in the same first paint, and on the server, already
  // resolve; the set is idempotent (same reference every render, the
  // movers mutate it in place, `replace` swaps it and the next render
  // re-registers). The effect mirrors the registration because StrictMode
  // exercises the cleanup path on mount (unsubscribe, un-register, re-run)
  // without a fresh render in between — without it the table would stay
  // empty and every item would resolve to -1. Unmount drops the entry
  // only while this hook still owns it; a second useFieldArray at the
  // same path competes for the slot last-wins, same as the changeHandlers
  // registration.
  registerArrayIds(form, path.key, idsRef.current);
  useEffect(() => {
    registerArrayIds(form, path.key, idsRef.current);
    return () => {
      const registry = arrayIdsRegistry.get(form);
      if (registry?.get(path.key) === idsRef.current) registry.delete(path.key);
    };
  }, [form, path.key]);

  const append = useStageFn((value: any) => {
    const arr = getArray();
    idsRef.current.push(generateId(form));
    setArray([...arr, value]);
  });

  const prepend = useStageFn((value: any) => {
    const arr = getArray();
    idsRef.current.unshift(generateId(form));
    setArray([value, ...arr]);
  });

  const insert = useStageFn((index: number, value: any) => {
    const arr = getArray();
    idsRef.current.splice(index, 0, generateId(form));
    const newArr = [...arr.slice(0, index), value, ...arr.slice(index)];
    setArray(newArr);
  });

  const remove = useStageFn((index: number) => {
    const arr = getArray();
    idsRef.current.splice(index, 1);
    const newArr = arr.filter((_: any, i: number) => i !== index);
    setArray(newArr);
  });

  const swap = useStageFn((from: number, to: number) => {
    const arr = getArray();
    [idsRef.current[from], idsRef.current[to]] = [
      idsRef.current[to],
      idsRef.current[from]
    ];
    const newArr = [...arr];
    [newArr[from], newArr[to]] = [newArr[to], newArr[from]];
    setArray(newArr);
  });

  const move = useStageFn((from: number, to: number) => {
    const arr = getArray();
    const [id] = idsRef.current.splice(from, 1);
    idsRef.current.splice(to, 0, id);
    const newArr = [...arr];
    const [item] = newArr.splice(from, 1);
    newArr.splice(to, 0, item);
    setArray(newArr);
  });

  // replace is a full swap (length may change), so every row is conceptually
  // a new row: regenerate all ids to remount them, mirroring how reset works.
  const replace = useStageFn((values: any[]) => {
    idsRef.current = values.map(() => generateId(form));
    setArray([...values]);
  });

  // update only overwrites one value, so the id at that index is kept and the
  // row does not remount. Out-of-bounds indices are a silent no-op — plain
  // assignment would instead punch sparse-array holes into the form state.
  const update = useStageFn((index: number, value: any) => {
    const arr = getArray();
    if (index < 0 || index >= arr.length) return;
    const newArr = [...arr];
    newArr[index] = value;
    setArray(newArr);
  });

  return {fields, append, prepend, insert, remove, swap, move, replace, update};
}

export default function useFieldArray(options: {
  name: Name;
  form?: Form;
}): UseFieldArrayResult {
  return useFieldArrayCore(options, FormContext);
}

/**
 * The result of {@link useFieldArrayItem}. Mirrors the {@link useField}
 * return shape (`value`/`errors`/`error`) plus the row's `index` and
 * `name` (path key) so nested fields can build on it —
 * `useField({name: ['tags', item.index, 'label']})`.
 */
export interface UseFieldArrayItemResult<TValue = any> {
  value: TValue;
  /** Overwrite this row's value in place (same array-layer write as
   * `update(index, value)`: the row's id and position are kept). */
  setValue: (value: TValue) => void;
  /** Every error registered for the row's path, insertion order; the
   * shared empty constant while clean, so consumers can memo on it. */
  errors: FieldError[];
  /** First error's message — the display text — or undefined. */
  error: string | undefined;
  /** The row's current path key (JSON-stringified segments, e.g.
   * `["tags",0]`); moves with the row across reorder/remove. */
  name: string;
  /** The row's current position in the array. `-1` while the row is being
   * removed (or when no useFieldArray is mounted at `name`): reads return
   * undefined and nothing writes the dangling path. */
  index: number;
  form: Form;
}

/**
 * Shared core of {@link useFieldArrayItem} and the per-instance hook
 * returned by `createFormContext()`: identical behavior, but the form is
 * resolved from whichever Context instance is passed in instead of the
 * module-level one.
 */
export function useFieldArrayItemCore<TValue = any>(
  options: {name: Name; id: string; form?: Form},
  Context: Context<any>
): UseFieldArrayItemResult<TValue> {
  // Read the context unconditionally (hook call order must be stable), then
  // let an explicitly passed form win — works without a <FormProvider>.
  const contextForm = useContext(Context);
  const form = options.form || contextForm;
  if (!form) throw new Error('no form provided');
  const {id} = options;
  const arrayPath = usePath(options.name);

  // --- snapshots: locate the row by its stable id through the array's
  // published ids table, then read its value from the array layer — the
  // same layer every useFieldArray operation and `setValue` below write,
  // so `value` and update/append/swap/… always agree with each other.
  const computeIndex = useCallback(
    () => getArrayIds(form, arrayPath.key)?.indexOf(id) ?? -1,
    [form, arrayPath.key, id]
  );
  const computeValue = useCallback(
    (index: number) => {
      const arr = getValueByPath(form, arrayPath);
      return Array.isArray(arr) ? arr[index] : undefined;
    },
    [form, arrayPath]
  );

  // Both are read synchronously during render (SSR included: no effect is
  // involved), and the last-rendered pair is mirrored into refs for the
  // subscription below. Writing own refs during render follows the same
  // pattern as `useStage`.
  const index = computeIndex();
  const value = computeValue(index) as TValue;
  const lastRef = useRef({index, value});
  lastRef.current = {index, value};

  // A render is scheduled only when the row's own view would change. The
  // subscription is 'leaf'-scoped on the array key: every useFieldArray
  // operation rewrites that key (payload-less broadcasts — reset,
  // setInitialValues — always fire), so this fires exactly when the row
  // order or the array can have moved, while a write to one item's leaf
  // path (`['tags', 1]`) never fires it. The comparison happens in the
  // listener — not through React's equal-state bailout, which act/test
  // environments do not honor — so an unchanged row never dispatches at
  // all and its component function never runs: append, update and
  // single-row edits leave untouched rows completely quiet, and a
  // whole-array rewrite re-renders only rows whose value reference (or
  // index) actually changed — the shallow copies keep untouched items'
  // references stable. Rows whose index migrates (remove/move/swap/
  // insert) re-render by design; computing `next` with the fresh index
  // means a row that moved but kept its value still bumps.
  const computeRef = useStage({computeIndex, computeValue});
  const [, bump] = useReducer(bumpReducer, 0);
  useEffect(
    () =>
      onPathEvent(form.emitter, 'change', arrayPath, 'leaf', () => {
        const {computeIndex: idx, computeValue: val} = computeRef.current;
        const nextIndex = idx();
        if (
          nextIndex !== lastRef.current.index ||
          !Object.is(val(nextIndex), lastRef.current.value)
        )
          bump();
      }),
    [form.emitter, arrayPath, computeRef]
  );

  // --- errors: stored per exact key, so this is the one place the row's
  // indexed path is needed. A removed row resolves to index -1: the
  // parent is about to unmount this component (its key left `fields`),
  // and until that commit lands the dangling key is inert — reads return
  // undefined/no errors and the `setValue` guard refuses to write. -1
  // also surfaces when no useFieldArray is mounted at `name`; pairing
  // the two hooks is the documented contract.
  const itemPath = usePath([...arrayPath.value, index]);
  const errors = useFieldErrorsByPath(form, itemPath);

  const setValue = useStageFn((v: TValue) => {
    if (index < 0) return;
    const arr = [...(getValueByPath(form, arrayPath) ?? [])];
    if (index >= arr.length) return;
    arr[index] = v;
    setValueByPath(form, arrayPath, arr);
  });

  return {
    value,
    setValue,
    errors,
    error: errors[0]?.message,
    name: itemPath.key,
    index,
    form
  };
}

/**
 * Subscribe to a single row of a {@link useFieldArray} field — the
 * per-item counterpart `useFieldArray` alone cannot offer. `useFieldArray`
 * subscribes to the whole branch, so any row's edit re-renders the
 * component holding the array (and, without memoization, every row);
 * `useFieldArrayItem` scopes what re-renders to one row identified by its
 * stable id: editing row K re-renders only row K's component, and a
 * whole-array rewrite re-renders only rows whose value reference actually
 * changed. Pair it with a `React.memo` row component that takes stable
 * props (`form`, `id`) so the array component's own re-render cannot drag
 * the rows along.
 *
 * Rows whose index migrates — remove/move/swap/insert reshuffles —
 * re-render by design: the row's path contains the index, exactly like
 * TanStack Form's per-field api. The win is single-row edits staying
 * single-row.
 *
 * Value reads and writes live on the array layer — the same layer every
 * `useFieldArray` operation touches — so `value`, `setValue` and
 * `update`/`append`/… always agree with each other.
 *
 * @param options `name` of the array (a useFieldArray must be mounted at
 * the same path — it publishes the id table), the row's `id` from
 * `fields[i].id`, and optionally an explicit `form`
 */
export function useFieldArrayItem<TValue = any>(options: {
  name: Name;
  id: string;
  form?: Form;
}): UseFieldArrayItemResult<TValue> {
  return useFieldArrayItemCore(options, FormContext);
}
