// Tests for src/persist.ts — the `react-f0rm/persist` side entry
// (localStorage persistence for a form instance). Imported from
// '../src/persist' ONLY so the file doubles as proof the entry is
// self-sufficient and React-free.
import {describe, it, expect, vi} from 'vitest';
import createForm, {getValues, setValue} from '../src/form';
import {persistForm} from '../src/persist';

/** In-memory Storage-compatible backend so tests never touch jsdom's
 * shared localStorage. */
function memoryStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value)
  };
}

describe('persistForm', () => {
  it('hydrates a stored snapshot as the clean baseline', () => {
    const backend = memoryStorage();
    backend.setItem('my-form', JSON.stringify({name: 'ada', age: 36}));
    const form = createForm({initialValues: {name: '', age: 0}});
    persistForm(form, {key: 'my-form', storage: backend});
    expect(getValues(form)).toEqual({name: 'ada', age: 36});
    // Hydration is a baseline, not an edit: the form starts clean.
    expect(form.values.size).toBe(0);
  });

  it('writes the values tree on every change event', () => {
    const backend = memoryStorage();
    const form = createForm({initialValues: {name: ''}});
    persistForm(form, {key: 'my-form', storage: backend});
    setValue(form, 'name', 'ada');
    expect(JSON.parse(backend.store.get('my-form')!)).toEqual({name: 'ada'});
    setValue(form, 'name', 'grace');
    expect(JSON.parse(backend.store.get('my-form')!)).toEqual({name: 'grace'});
  });

  it('serialize transforms before writing, deserialize on reading', () => {
    const backend = memoryStorage();
    backend.setItem('my-form', 'v1:{"name":"ada"}');
    const form = createForm({initialValues: {name: ''}});
    persistForm(form, {
      key: 'my-form',
      storage: backend,
      serialize: values => ({v: 1, data: values}),
      deserialize: raw => JSON.parse(raw.slice(3))
    });
    expect(getValues(form)).toEqual({name: 'ada'});
    setValue(form, 'name', 'grace');
    expect(JSON.parse(backend.store.get('my-form')!)).toEqual({
      v: 1,
      data: {name: 'grace'}
    });
  });

  it('ignores a corrupted stored payload', () => {
    const backend = memoryStorage();
    backend.setItem('my-form', '{not json');
    const form = createForm({initialValues: {name: 'init'}});
    persistForm(form, {key: 'my-form', storage: backend});
    expect(getValues(form)).toEqual({name: 'init'});
  });

  it('unsubscribing stops future writes', () => {
    const backend = memoryStorage();
    const form = createForm({initialValues: {name: ''}});
    const stop = persistForm(form, {key: 'my-form', storage: backend});
    setValue(form, 'name', 'ada');
    stop();
    setValue(form, 'name', 'grace');
    expect(JSON.parse(backend.store.get('my-form')!)).toEqual({name: 'ada'});
  });

  it('is a silent no-op without storage (SSR)', () => {
    vi.stubGlobal('localStorage', undefined);
    const form = createForm({initialValues: {name: ''}});
    const stop = persistForm(form, {key: 'my-form'});
    setValue(form, 'name', 'ada');
    // No throw, unsubscribe is a callable no-op.
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
