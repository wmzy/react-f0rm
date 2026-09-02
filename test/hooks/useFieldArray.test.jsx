import {describe, it, expect} from 'vitest';
import {render, renderHook, act} from '@testing-library/react';
import {FormProvider} from '../../src/context';
import useFieldArray from '../../src/hooks/fieldArray';
import useField from '../../src/hooks/field';
import useForm from '../../src/hooks/form';
import createForm, {
  getValueByPath,
  getValues,
  setValue,
  reset
} from '../../src/form';
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
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {
      wrapper
    });
    expect(result.current.fields).toHaveLength(2);
    expect(result.current.fields[0].index).toBe(0);
    expect(result.current.fields[1].index).toBe(1);
    // Each field should have a stable id
    expect(typeof result.current.fields[0].id).toBe('string');
  });

  it('append adds item', () => {
    const wrapper = createWrapper({items: ['a']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {
      wrapper
    });
    act(() => result.current.append('b'));
    expect(result.current.fields).toHaveLength(2);
  });

  it('keeps ids unique under StrictMode double render', () => {
    const wrapper = createWrapper({items: ['a', 'b']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {
      wrapper: ({children}) => (
        <React.StrictMode>{wrapper({children})}</React.StrictMode>
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
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {
      wrapper
    });
    act(() => result.current.prepend('z'));
    expect(result.current.fields).toHaveLength(2);
  });

  it('insert adds item at index', () => {
    const wrapper = createWrapper({items: ['a', 'c']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {
      wrapper
    });
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
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {
      wrapper
    });
    act(() => result.current.remove(1));
    expect(result.current.fields).toHaveLength(2);
  });

  it('swap exchanges two items', () => {
    const wrapper = createWrapper({items: ['a', 'b']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {
      wrapper
    });
    act(() => result.current.swap(0, 1));
    expect(result.current.fields).toHaveLength(2);
  });

  it('move repositions item', () => {
    const wrapper = createWrapper({items: ['a', 'b', 'c']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {
      wrapper
    });
    act(() => result.current.move(0, 2));
    expect(result.current.fields).toHaveLength(3);
  });

  it('does not re-render the array when an unrelated field changes', () => {
    const form = createForm({initialValues: {tags: ['a'], other: 'x'}});
    let renders = 0;
    function TagsArray() {
      renders += 1;
      const {fields} = useFieldArray({name: 'tags', form});
      return (
        <div>
          {fields.map(f => (
            <span key={f.id}>{f.index}</span>
          ))}
        </div>
      );
    }
    render(<TagsArray />);
    const initialRenders = renders;
    act(() => setValue(form, 'other', 'y'));
    expect(renders).toBe(initialRenders);
    // Sanity: a change inside this array's branch still re-renders.
    act(() => setValue(form, 'tags[0]', 'b'));
    expect(renders).toBe(initialRenders + 1);
    expect(getValueByPath(form, createPath('tags[0]'))).toBe('b');
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
      return (
        <div>
          {fields.map(f => (
            <span key={f.id}>{f.index}</span>
          ))}
        </div>
      );
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

  it('re-syncs when a deep descendant of an item changes', () => {
    // Branch scope: writes arbitrarily far below the array key re-aggregate
    // the subtree, not just direct children.
    const form = createForm({initialValues: {tags: [{name: 'a'}]}});
    let renders = 0;
    function TagsArray() {
      renders += 1;
      const {fields} = useFieldArray({name: 'tags', form});
      return (
        <div>
          {fields.map(f => (
            <span key={f.id}>{f.index}</span>
          ))}
        </div>
      );
    }
    render(<TagsArray />);
    const initialRenders = renders;
    act(() => setValue(form, 'tags[0].name', 'b'));
    expect(renders).toBe(initialRenders + 1);
    expect(getValueByPath(form, createPath('tags[0].name'))).toBe('b');
  });

  it('scopes a nested array by its full multi-segment key', () => {
    const form = createForm({
      initialValues: {a: {tags: ['x'], other: 'y'}}
    });
    let renders = 0;
    let api;
    function NestedArray() {
      renders += 1;
      api = useFieldArray({name: 'a.tags', form});
      return <div>{api.fields.length}</div>;
    }
    render(<NestedArray />);
    const initialRenders = renders;
    // Sibling inside the same parent object: silent.
    act(() => setValue(form, 'a.other', 'z'));
    expect(renders).toBe(initialRenders);
    // Prefix lookalike at depth: 'a.tagsX' must not match 'a.tags'.
    act(() => setValue(form, 'a.tagsX', 'q'));
    expect(renders).toBe(initialRenders);
    // A descendant write re-syncs.
    act(() => setValue(form, 'a.tags[0]', 'b'));
    expect(renders).toBe(initialRenders + 1);
    expect(getValueByPath(form, createPath('a.tags[0]'))).toBe('b');
    // Own writes (append) still re-sync.
    act(() => api.append('c'));
    expect(api.fields).toHaveLength(2);
  });

  it('replace swaps the whole array and regenerates ids', () => {
    const form = createForm({initialValues: {items: ['a', 'b', 'c']}});
    const {result} = renderHook(() => useFieldArray({name: 'items', form}));
    const idsBefore = result.current.fields.map(f => f.id);
    act(() => result.current.replace(['x', 'y']));
    expect(result.current.fields).toHaveLength(2);
    expect(result.current.fields.map(f => f.index)).toEqual([0, 1]);
    expect(getValues(form).items).toEqual(['x', 'y']);
    // Full replacement remounts every row: all ids are new.
    result.current.fields.forEach(f => {
      expect(idsBefore).not.toContain(f.id);
    });
  });

  it('replace re-renders rows for the new values without errors', () => {
    const form = createForm({initialValues: {tags: ['a', 'b']}});
    let api;
    function TagsArray() {
      api = useFieldArray({name: 'tags', form});
      const values = getValues(form).tags;
      return (
        <div>
          {api.fields.map(f => (
            <span key={f.id}>{values[f.index]}</span>
          ))}
        </div>
      );
    }
    const {container} = render(<TagsArray />);
    expect(container.textContent).toBe('ab');
    act(() => api.replace(['x', 'y', 'z']));
    expect(container.textContent).toBe('xyz');
  });

  it('update replaces a value while keeping the item id', () => {
    const form = createForm({initialValues: {items: ['a', 'b']}});
    const {result} = renderHook(() => useFieldArray({name: 'items', form}));
    const idsBefore = result.current.fields.map(f => f.id);
    act(() => result.current.update(1, 'B'));
    expect(getValues(form).items).toEqual(['a', 'B']);
    expect(result.current.fields).toHaveLength(2);
    // Same id at the same index: the row is not remounted.
    expect(result.current.fields.map(f => f.id)).toEqual(idsBefore);
  });

  it('update ignores out-of-bounds indices', () => {
    const form = createForm({initialValues: {items: ['a']}});
    const {result} = renderHook(() => useFieldArray({name: 'items', form}));
    act(() => result.current.update(3, 'x'));
    act(() => result.current.update(-1, 'x'));
    expect(getValues(form).items).toEqual(['a']);
    expect(result.current.fields).toHaveLength(1);
  });

  // Every array operation rewrites the parent path as a whole value, so
  // leaf fields under the array read through the live ancestor key — the
  // regression suite for the layering bug where a leaf useField fell back
  // to the initialValues snapshot after update/replace and kept showing
  // the pre-edit value.
  describe('leaf useField stays on the array generation', () => {
    function setup(initialValues) {
      const form = createForm({initialValues});
      const {result} = renderHook(() => {
        const array = useFieldArray({name: 'items', form});
        const firstName = useField({form, name: 'items[0].name'});
        const secondName = useField({form, name: 'items[1].name'});
        return {array, firstName, secondName};
      });
      return {form, result};
    }

    it('update moves a leaf field onto the new value', () => {
      const {form, result} = setup({items: [{name: 'old'}]});
      expect(result.current.firstName.value).toBe('old');
      act(() => result.current.array.update(0, {name: 'new'}));
      expect(result.current.firstName.value).toBe('new');
      expect(getValues(form)).toEqual({items: [{name: 'new'}]});
    });

    it('update supersedes an earlier leaf edit (typed-then-update)', () => {
      const {result} = setup({items: [{name: 'old'}]});
      act(() => result.current.firstName.onChange('typed'));
      expect(result.current.firstName.value).toBe('typed');
      act(() => result.current.array.update(0, {name: 'new'}));
      expect(result.current.firstName.value).toBe('new');
    });

    it('replace moves leaf fields onto the new array', () => {
      const {form, result} = setup({items: [{name: 'old'}]});
      act(() => result.current.array.replace([{name: 'x'}, {name: 'y'}]));
      expect(result.current.firstName.value).toBe('x');
      expect(result.current.secondName.value).toBe('y');
      expect(getValues(form)).toEqual({items: [{name: 'x'}, {name: 'y'}]});
    });

    it('append/remove/swap after update stay consistent', () => {
      const {form, result} = setup({items: [{name: 'a'}, {name: 'b'}]});
      act(() => result.current.array.update(0, {name: 'A'}));
      // swap: the leaf paths are index-addressed, so they read the
      // post-swap rows — not the replaced generation's rows.
      act(() => result.current.array.swap(0, 1));
      expect(result.current.firstName.value).toBe('b');
      expect(result.current.secondName.value).toBe('A');
      // remove shifts rows up under the same leaf paths.
      act(() => result.current.array.remove(1));
      expect(result.current.firstName.value).toBe('b');
      expect(getValues(form)).toEqual({items: [{name: 'b'}]});
      // append re-grows the array; the untouched row does not fall back.
      act(() => result.current.array.append({name: 'c'}));
      expect(result.current.firstName.value).toBe('b');
      expect(result.current.secondName.value).toBe('c');
      expect(getValues(form)).toEqual({
        items: [{name: 'b'}, {name: 'c'}]
      });
    });

    it('leaf edits after an update layer over the array value', () => {
      const {form, result} = setup({items: [{name: 'old'}]});
      act(() => result.current.array.update(0, {name: 'new', qty: 2}));
      act(() => result.current.firstName.onChange('edited'));
      expect(result.current.firstName.value).toBe('edited');
      expect(getValues(form)).toEqual({
        items: [{name: 'edited', qty: 2}]
      });
    });

    it('update keeps leaf fields on the new value under StrictMode', () => {
      const form = createForm({initialValues: {items: [{name: 'old'}]}});
      const {result} = renderHook(
        () => {
          const array = useFieldArray({name: 'items', form});
          const firstName = useField({form, name: 'items[0].name'});
          return {array, firstName};
        },
        {
          wrapper: ({children}) => (
            <React.StrictMode>{children}</React.StrictMode>
          )
        }
      );
      act(() => result.current.array.update(0, {name: 'new'}));
      expect(result.current.firstName.value).toBe('new');
      expect(getValues(form)).toEqual({items: [{name: 'new'}]});
    });
  });
});
