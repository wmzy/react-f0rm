import {describe, it, expect} from 'vitest';
import {render, renderHook, act} from '@testing-library/react';
import {FormProvider} from '../../src/context';
import useFieldArray from '../../src/hooks/fieldArray';
import useForm from '../../src/hooks/form';
import {getValueByPath} from '../../src/form';
import createForm, {getValues, setValue, reset} from '../../src/form';
import createPath from '../../src/path';
import React from 'react';

function createWrapper(initialValues) {
  return function Wrapper({children}) {
    const form = useForm({initialValues});
    return <FormProvider value={form}>{children}</FormProvider>;
  };
}

describe('useFieldArray', () => {
  it('returns fields array', () => {
    const wrapper = createWrapper({items: ['a', 'b']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {wrapper});
    expect(result.current.fields).toHaveLength(2);
    expect(result.current.fields[0].index).toBe(0);
    expect(result.current.fields[1].index).toBe(1);
    // Each field should have a stable id
    expect(typeof result.current.fields[0].id).toBe('string');
  });

  it('append adds item', () => {
    const wrapper = createWrapper({items: ['a']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {wrapper});
    act(() => result.current.append('b'));
    expect(result.current.fields).toHaveLength(2);
  });

  it('keeps ids unique under StrictMode double render', () => {
    const wrapper = createWrapper({items: ['a', 'b']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {
      wrapper: ({children}) => (
        <React.StrictMode>
          {wrapper({children})}
        </React.StrictMode>
      )
    });
    const ids = result.current.fields.map(f => f.id);
    expect(new Set(ids).size).toBe(2);
    act(() => result.current.append('c'));
    expect(result.current.fields).toHaveLength(3);
    expect(new Set(result.current.fields.map(f => f.id)).size).toBe(3);
    expect(result.current.fields.slice(0, 2).map(f => f.id)).toEqual(ids);
  });

  it('prepend adds item at start', () => {
    const wrapper = createWrapper({items: ['a']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {wrapper});
    act(() => result.current.prepend('z'));
    expect(result.current.fields).toHaveLength(2);
  });

  it('insert adds item at index', () => {
    const wrapper = createWrapper({items: ['a', 'c']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {wrapper});
    act(() => result.current.insert(1, 'b'));
    expect(result.current.fields).toHaveLength(3);
  });

  it('works with an explicitly passed form and no FormProvider', () => {
    const form = createForm();
    const {result} = renderHook(() => useFieldArray({name: 'items', form}));
    expect(result.current.fields).toHaveLength(0);
    act(() => result.current.append('a'));
    expect(result.current.fields).toHaveLength(1);
    expect(getValues(form).items).toEqual(['a']);
  });

  it('remove deletes item at index', () => {
    const wrapper = createWrapper({items: ['a', 'b', 'c']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {wrapper});
    act(() => result.current.remove(1));
    expect(result.current.fields).toHaveLength(2);
  });

  it('swap exchanges two items', () => {
    const wrapper = createWrapper({items: ['a', 'b']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {wrapper});
    act(() => result.current.swap(0, 1));
    expect(result.current.fields).toHaveLength(2);
  });

  it('move repositions item', () => {
    const wrapper = createWrapper({items: ['a', 'b', 'c']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {wrapper});
    act(() => result.current.move(0, 2));
    expect(result.current.fields).toHaveLength(3);
  });

  it('does not re-render the array when an unrelated field changes', () => {
    const form = createForm({initialValues: {tags: ['a'], other: 'x'}});
    let renders = 0;
    function TagsArray() {
      renders += 1;
      const {fields} = useFieldArray({name: 'tags', form});
      return <div>{fields.map(f => <span key={f.id}>{f.index}</span>)}</div>;
    }
    render(<TagsArray />);
    const initialRenders = renders;
    act(() => setValue(form, 'other', 'y'));
    expect(renders).toBe(initialRenders);
    // Sanity: a change inside this array's branch still re-renders.
    act(() => setValue(form, 'tags.0', 'b'));
    expect(renders).toBe(initialRenders + 1);
    expect(getValueByPath(form, createPath('tags.0'))).toBe('b');
  });

  it('still re-renders and syncs on its own append/remove/swap', () => {
    const form = createForm({initialValues: {tags: ['a', 'b']}});
    let renders = 0;
    let api;
    function TagsArray() {
      renders += 1;
      api = useFieldArray({name: 'tags', form});
      return <div>{api.fields.length}</div>;
    }
    render(<TagsArray />);
    const initialRenders = renders;

    act(() => api.append('c'));
    expect(renders).toBeGreaterThan(initialRenders);
    expect(api.fields).toHaveLength(3);

    const beforeRemove = renders;
    act(() => api.remove(0));
    expect(renders).toBeGreaterThan(beforeRemove);
    expect(api.fields).toHaveLength(2);

    const [id0, id1] = api.fields.map(f => f.id);
    const beforeSwap = renders;
    act(() => api.swap(0, 1));
    expect(renders).toBeGreaterThan(beforeSwap);
    expect(api.fields.map(f => f.id)).toEqual([id1, id0]);
  });

  it('does not re-render when a sibling name is a string prefix of the array name', () => {
    // '["tagsX"]' must not be treated as a descendant of '["tags"]'
    const form = createForm({initialValues: {tags: ['a'], tagsX: 'x'}});
    let renders = 0;
    function TagsArray() {
      renders += 1;
      const {fields} = useFieldArray({name: 'tags', form});
      return <div>{fields.map(f => <span key={f.id}>{f.index}</span>)}</div>;
    }
    render(<TagsArray />);
    const initialRenders = renders;
    act(() => setValue(form, 'tagsX', 'y'));
    expect(renders).toBe(initialRenders);
    expect(getValues(form).tagsX).toBe('y');
  });

  it('re-syncs fields when the form is reset (payload-less change event)', () => {
    const form = createForm({initialValues: {tags: ['a', 'b']}});
    let api;
    function TagsArray() {
      api = useFieldArray({name: 'tags', form});
      return <div>{api.fields.length}</div>;
    }
    render(<TagsArray />);
    expect(api.fields).toHaveLength(2);
    act(() => reset(form, {tags: ['x']}));
    expect(api.fields).toHaveLength(1);
  });
});
