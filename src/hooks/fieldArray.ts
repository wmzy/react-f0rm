import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from 'react';
import {FormContext} from '../context';
import {getValueByPath, setValueByPath} from '../form';
import type {Form, Name} from '../form';
import {onPathEvent} from '../subscribe';
import usePath from './path';
import {useStageFn} from './stage';

let idCounter = 0;
function generateId(): string {
  return `_${++idCounter}`;
}

interface FieldArrayItem {
  id: string;
  index: number;
}

export default function useFieldArray(options: {name: Name; form?: Form}): {
  fields: FieldArrayItem[];
  append: (value: any) => void;
  prepend: (value: any) => void;
  insert: (index: number, value: any) => void;
  remove: (index: number) => void;
  swap: (from: number, to: number) => void;
  move: (from: number, to: number) => void;
} {
  // Read the context unconditionally (hook call order must be stable), then
  // let an explicitly passed form win — works without a <FormProvider>.
  const contextForm = useContext(FormContext);
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
      idsRef.current.push(generateId());
    }
    while (idsRef.current.length > arr.length) {
      idsRef.current.pop();
    }
    return idsRef.current.map((id, index) => ({id, index}));
  }, [getArray]);

  // Subscribe to 'change' events scoped to this array's branch: the array
  // key itself, its ancestors (an ancestor write replaces what the leaf
  // read falls back to) and its descendants (item edits), so typing into
  // unrelated fields does not re-render the array component. Payload-less
  // 'change' emits (reset, removeFieldByPath, setInitialValues) always
  // sync. The comma-separated key prefix comparison lives in onPathEvent,
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

  const append = useStageFn((value: any) => {
    const arr = getArray();
    idsRef.current.push(generateId());
    setArray([...arr, value]);
  });

  const prepend = useStageFn((value: any) => {
    const arr = getArray();
    idsRef.current.unshift(generateId());
    setArray([value, ...arr]);
  });

  const insert = useStageFn((index: number, value: any) => {
    const arr = getArray();
    idsRef.current.splice(index, 0, generateId());
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

  return {fields, append, prepend, insert, remove, swap, move};
}
