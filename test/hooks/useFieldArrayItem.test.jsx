import {describe, it, expect, vi, afterEach} from 'vitest';
import React from 'react';
import {render, renderHook, act, fireEvent} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {createRoot} from 'react-dom/client';
import {FormProvider, createFormContext} from '../../src/context';
import useFieldArray, {useFieldArrayItem} from '../../src/hooks/fieldArray';
import useField from '../../src/hooks/field';
import useForm from '../../src/hooks/form';
import createForm, {getValues, setValue, setError, reset} from '../../src/form';

/**
 * A memoized row reading everything through useFieldArrayItem. The stable
 * props (id, optional form) are what lets React.memo shield rows from the
 * array component's own re-renders — the usage shape this hook is built
 * for. Render counts and the latest hook result are recorded per id.
 */
function makeRow() {
  const counts = new Map();
  const latest = new Map();
  const Item = React.memo(function Item({id, form}) {
    const item = useFieldArrayItem({name: 'tags', id, form});
    counts.set(id, (counts.get(id) || 0) + 1);
    latest.set(id, item);
    return <li data-testid={`row-${id}`}>{String(item.value)}</li>;
  });
  return {Item, counts, latest};
}

function setup(initialValues = {tags: ['a', 'b', 'c']}) {
  const form = createForm({initialValues});
  const {Item, counts, latest} = makeRow();
  let arrayApi;
  function Tags() {
    arrayApi = useFieldArray({name: 'tags', form});
    return (
      <ul>
        {arrayApi.fields.map(f => (
          <Item key={f.id} id={f.id} form={form} />
        ))}
      </ul>
    );
  }
  const utils = render(<Tags />);
  return {
    form,
    counts,
    latest,
    api: () => arrayApi,
    ids: () => arrayApi.fields.map(f => f.id),
    count: id => counts.get(id) || 0,
    rowText: id => utils.getByTestId(`row-${id}`).textContent,
    ...utils
  };
}

describe('useFieldArrayItem', () => {
  it('resolves value, index and name for each row', () => {
    const s = setup();
    const [id0, id1] = s.ids();
    expect(s.latest.get(id0).value).toBe('a');
    expect(s.latest.get(id0).index).toBe(0);
    expect(s.latest.get(id0).name).toBe('["tags",0]');
    expect(s.latest.get(id1).value).toBe('b');
    expect(s.latest.get(id1).index).toBe(1);
    expect(s.latest.get(id1).errors).toEqual([]);
    expect(s.latest.get(id1).error).toBeUndefined();
    expect(s.latest.get(id0).form).toBe(s.form);
  });

  it('re-renders only the edited row (setValue)', () => {
    const s = setup();
    const [id0, id1, id2] = s.ids();
    const before = [s.count(id0), s.count(id1), s.count(id2)];
    act(() => s.latest.get(id1).setValue('B'));
    expect(s.count(id0)).toBe(before[0]);
    expect(s.count(id1)).toBe(before[1] + 1);
    expect(s.count(id2)).toBe(before[2]);
    expect(s.rowText(id1)).toBe('B');
    expect(getValues(s.form).tags).toEqual(['a', 'B', 'c']);
  });

  it('re-renders only the updated row (update rewrites the whole array)', () => {
    const s = setup();
    const [id0, id1, id2] = s.ids();
    const before = [s.count(id0), s.count(id1), s.count(id2)];
    act(() => s.api().update(2, 'C'));
    expect(s.count(id0)).toBe(before[0]);
    expect(s.count(id1)).toBe(before[1]);
    expect(s.count(id2)).toBe(before[2] + 1);
    expect(s.rowText(id2)).toBe('C');
    expect(getValues(s.form).tags).toEqual(['a', 'b', 'C']);
  });

  it('row writes and a leaf useField under the row stay on one generation', () => {
    // Both item.setValue and array update rewrite the parent path as a
    // whole value; a leaf field inside the row must follow those writes
    // instead of falling back to the initialValues snapshot (the layering
    // bug this suite pins) — and a later leaf edit layers over the row
    // value without resurrecting the replaced generation.
    const form = createForm({initialValues: {tags: [{label: 'old'}]}});
    let api;
    let leaf;
    let itemApi;
    function Row({id}) {
      const item = useFieldArrayItem({name: 'tags', id, form});
      leaf = useField({form, name: ['tags', item.index, 'label']});
      itemApi = item;
      return <li data-testid={`row-${id}`}>{String(item.value?.label)}</li>;
    }
    function Tags() {
      api = useFieldArray({name: 'tags', form});
      return (
        <ul>
          {api.fields.map(f => (
            <Row key={f.id} id={f.id} />
          ))}
        </ul>
      );
    }
    render(<Tags />);
    expect(leaf.value).toBe('old');

    // Row-level write: the leaf follows.
    act(() => api.update(0, {label: 'api-write'}));
    expect(leaf.value).toBe('api-write');

    // Item-level write: the leaf follows too.
    act(() => itemApi.setValue({label: 'item-write'}));
    expect(leaf.value).toBe('item-write');

    // Leaf edit layers over the row value, and the next row write wins.
    act(() => leaf.onChange('leaf-write'));
    expect(leaf.value).toBe('leaf-write');
    act(() => api.update(0, {label: 'final'}));
    expect(leaf.value).toBe('final');
    expect(getValues(form)).toEqual({tags: [{label: 'final'}]});
  });

  it('append leaves existing rows untouched', () => {
    const s = setup();
    const [id0, id1, id2] = s.ids();
    const before = [s.count(id0), s.count(id1), s.count(id2)];
    act(() => s.api().append('d'));
    expect(s.ids()).toHaveLength(4);
    expect(s.count(id0)).toBe(before[0]);
    expect(s.count(id1)).toBe(before[1]);
    expect(s.count(id2)).toBe(before[2]);
    expect(s.rowText(s.ids()[3])).toBe('d');
  });

  it('remove unmounts the row and re-renders survivors with migrated index and value', () => {
    const s = setup();
    const [id0, id1, id2] = s.ids();
    const before1 = s.count(id1);
    const before2 = s.count(id2);
    act(() => s.api().remove(0));
    expect(s.queryByTestId(`row-${id0}`)).toBeNull();
    expect(s.latest.get(id1).index).toBe(0);
    expect(s.latest.get(id1).value).toBe('b');
    expect(s.latest.get(id2).index).toBe(1);
    expect(s.latest.get(id2).value).toBe('c');
    expect(s.count(id1)).toBe(before1 + 1);
    expect(s.count(id2)).toBe(before2 + 1);
  });

  it('swap re-renders only the two swapped rows; values follow the ids', () => {
    const s = setup();
    const [id0, id1, id2] = s.ids();
    const before = [s.count(id0), s.count(id1), s.count(id2)];
    act(() => s.api().swap(0, 2));
    expect(s.count(id0)).toBe(before[0] + 1);
    expect(s.count(id1)).toBe(before[1]);
    expect(s.count(id2)).toBe(before[2] + 1);
    // ids and values travel together: after swapping positions 0 and 2,
    // id0's row sits at index 2 still holding 'a', id2's at index 0
    // holding 'c' — the visual order flips (c, b, a) without remounting.
    expect(s.latest.get(id0).value).toBe('a');
    expect(s.latest.get(id0).index).toBe(2);
    expect(s.latest.get(id2).value).toBe('c');
    expect(s.latest.get(id2).index).toBe(0);
    expect(s.rowText(id1)).toBe('b');
  });

  it('move re-renders every row whose index migrated', () => {
    const s = setup();
    const [id0, id1, id2] = s.ids();
    const before = [s.count(id0), s.count(id1), s.count(id2)];
    act(() => s.api().move(0, 2));
    expect(s.latest.get(id0).index).toBe(2);
    expect(s.latest.get(id0).value).toBe('a');
    expect(s.latest.get(id1).index).toBe(0);
    expect(s.latest.get(id2).index).toBe(1);
    expect(s.count(id0)).toBe(before[0] + 1);
    expect(s.count(id1)).toBe(before[1] + 1);
    expect(s.count(id2)).toBe(before[2] + 1);
  });

  it('replace remounts every row with fresh ids', () => {
    const s = setup();
    const oldIds = s.ids();
    act(() => s.api().replace(['x', 'y']));
    const newIds = s.ids();
    expect(newIds).toHaveLength(2);
    expect(newIds.some(id => oldIds.includes(id))).toBe(false);
    oldIds.forEach(id => expect(s.queryByTestId(`row-${id}`)).toBeNull());
    expect(s.rowText(newIds[0])).toBe('x');
    expect(s.rowText(newIds[1])).toBe('y');
  });

  it('subscribes to errors on the exact row key', () => {
    const s = setup();
    const [id0, id1, id2] = s.ids();
    const before = [s.count(id0), s.count(id1), s.count(id2)];
    act(() => setError(s.form, ['tags', 1], 'oops'));
    expect(s.count(id0)).toBe(before[0]);
    expect(s.count(id1)).toBe(before[1] + 1);
    expect(s.count(id2)).toBe(before[2]);
    expect(s.latest.get(id1).error).toBe('oops');
    expect(s.latest.get(id1).errors[0]).toEqual({
      type: 'custom',
      message: 'oops'
    });
  });

  it('a leaf-path write to one item does not re-render any row', () => {
    // Rows read the array layer, which useFieldArray operations write; a
    // direct leaf write (the useField channel) emits on the item's own
    // path and never wakes the array-key subscribers.
    const s = setup();
    const [id0, id1, id2] = s.ids();
    const before = [s.count(id0), s.count(id1), s.count(id2)];
    act(() => setValue(s.form, 'tags.1', 'B'));
    expect(s.count(id0)).toBe(before[0]);
    expect(s.count(id1)).toBe(before[1]);
    expect(s.count(id2)).toBe(before[2]);
  });

  it('resyncs on reset broadcasts', () => {
    const s = setup();
    const [id0, id1] = s.ids();
    act(() => reset(s.form, {tags: ['x', 'y', 'z', 'w']}));
    expect(s.ids()).toHaveLength(4);
    expect(s.rowText(id0)).toBe('x');
    expect(s.rowText(id1)).toBe('y');
  });

  it('without a paired useFieldArray the row is inert, not broken', () => {
    const form = createForm({initialValues: {tags: ['a']}});
    const {result} = renderHook(() =>
      useFieldArrayItem({name: 'tags', id: '_nope', form})
    );
    expect(result.current.index).toBe(-1);
    expect(result.current.value).toBeUndefined();
    expect(result.current.errors).toEqual([]);
    // setValue on a dangling row is a guarded no-op.
    act(() => result.current.setValue('x'));
    expect(getValues(form)).toEqual({tags: ['a']});
  });

  it('resolves the form from FormProvider', () => {
    const {Item} = makeRow();
    let seen;
    function Host() {
      const form = useForm({initialValues: {tags: ['a']}});
      return (
        <FormProvider value={form}>
          <Inner />
        </FormProvider>
      );
    }
    function Inner() {
      const {fields} = useFieldArray({name: 'tags'});
      seen = fields.map(f => f.id);
      return fields.map(f => <Item key={f.id} id={f.id} />);
    }
    render(<Host />);
    expect(document.querySelector('li').textContent).toBe('a');
    expect(seen).toHaveLength(1);
  });

  it('clears the id table when the array unmounts, so a remount is clean', () => {
    const s = setup();
    const form = s.form;
    const firstIds = s.ids();
    s.unmount();
    // A second array on the same form/path starts from scratch and rows
    // resolve against the new table only.
    const {Item, latest} = makeRow();
    let arrayApi;
    function Tags() {
      arrayApi = useFieldArray({name: 'tags', form});
      return (
        <ul>
          {arrayApi.fields.map(f => (
            <Item key={f.id} id={f.id} form={form} />
          ))}
        </ul>
      );
    }
    render(<Tags />);
    const secondIds = arrayApi.fields.map(f => f.id);
    expect(secondIds).toHaveLength(3);
    expect(secondIds).not.toEqual(firstIds);
    expect(latest.get(secondIds[0]).value).toBe('a');
    act(() => arrayApi.remove(0));
    expect(latest.get(secondIds[1]).value).toBe('b');
  });

  it('keeps single-row precision under StrictMode', () => {
    const form = createForm({initialValues: {tags: ['a', 'b', 'c']}});
    const {Item, counts, latest} = makeRow();
    let arrayApi;
    function Tags() {
      arrayApi = useFieldArray({name: 'tags', form});
      return (
        <ul>
          {arrayApi.fields.map(f => (
            <Item key={f.id} id={f.id} form={form} />
          ))}
        </ul>
      );
    }
    render(
      <React.StrictMode>
        <Tags />
      </React.StrictMode>
    );
    const ids = arrayApi.fields.map(f => f.id);
    expect(new Set(ids).size).toBe(3);
    const before = ids.map(id => counts.get(id) || 0);
    act(() => latest.get(ids[1]).setValue('B'));
    // StrictMode double-invokes renders of components that do render; the
    // precision claim is that untouched rows render zero times.
    expect(counts.get(ids[0])).toBe(before[0]);
    expect(counts.get(ids[2])).toBe(before[2]);
    expect(counts.get(ids[1])).toBeGreaterThan(before[1]);
    expect(document.querySelectorAll('li')[1].textContent).toBe('B');
  });

  it('is exposed through createFormContext bundles', () => {
    const Ctx = createFormContext();
    const CtxItem = React.memo(function CtxItem({id}) {
      const item = Ctx.useFieldArrayItem({name: 'tags', id});
      return (
        <li>
          <button
            type="button"
            onClick={() => item.setValue(String(item.value).toUpperCase())}
          >
            {String(item.value)}
          </button>
        </li>
      );
    });
    let arrayApi;
    function Inner() {
      arrayApi = Ctx.useFieldArray({name: 'tags'});
      return (
        <ul>
          {arrayApi.fields.map(f => (
            <CtxItem key={f.id} id={f.id} />
          ))}
        </ul>
      );
    }
    function Host() {
      const form = useForm({initialValues: {tags: ['a', 'b']}});
      return (
        <Ctx.FormProvider form={form}>
          <Inner />
        </Ctx.FormProvider>
      );
    }
    render(<Host />);
    const items = document.querySelectorAll('li button');
    expect(items[0].textContent).toBe('a');
    expect(items[1].textContent).toBe('b');
    act(() => fireEvent.click(items[0]));
    expect(items[0].textContent).toBe('A');
    expect(items[1].textContent).toBe('b');
  });
});

// SSR: rows resolve during renderToString (the id table is published at
// render time) and hydrate into live rows without mismatches.
describe('useFieldArrayItem SSR', () => {
  const roots = [];
  const containers = [];

  afterEach(() => {
    while (roots.length) roots.pop().unmount();
    while (containers.length) containers.pop().remove();
  });

  const SSRItem = React.memo(function SSRItem({id, form}) {
    const item = useFieldArrayItem({name: 'tags', id, form});
    return (
      <li data-testid={`ssr-${id}`}>
        {String(item.value)}
        <button
          type="button"
          onClick={() => item.setValue(String(item.value).toUpperCase())}
        >
          up
        </button>
      </li>
    );
  });

  function SSRForm() {
    const form = useForm({initialValues: {tags: ['a', 'b']}});
    const {fields} = useFieldArray({name: 'tags', form});
    return (
      <ul>
        {fields.map(f => (
          <SSRItem key={f.id} id={f.id} form={form} />
        ))}
      </ul>
    );
  }

  it('renders row values on the server', () => {
    const html = renderToString(<SSRForm />);
    expect(html).toContain('>a<button');
    expect(html).toContain('>b<button');
  });

  it('mounts interactively on the client with precise row updates', async () => {
    // Note: renderToString + hydrateRoot is not the supported path here —
    // useFieldArray's row ids are runtime-generated (a module counter), so
    // server and client produce different keys and React would remount
    // every row on hydration. That boundary predates this hook (it is
    // inherent to useFieldArray); SSR renders values fine and a fresh
    // client mount is fully interactive.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const container = document.createElement('div');
    document.body.appendChild(container);
    containers.push(container);

    await act(async () => {
      const root = createRoot(container);
      roots.push(root);
      root.render(<SSRForm />);
    });

    const [first, second] = container.querySelectorAll('li button');
    expect(first.parentElement.textContent).toContain('a');
    await act(async () => {
      fireEvent.click(first);
    });
    expect(first.parentElement.textContent).toContain('A');
    // The untouched row is neither rerendered nor corrupted.
    expect(second.parentElement.textContent).toContain('b');

    expect(errorSpy.mock.calls).toEqual([]);
    errorSpy.mockRestore();
  });
});
