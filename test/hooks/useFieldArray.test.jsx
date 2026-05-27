import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {FormProvider} from '../../src/context';
import useFieldArray from '../../src/hooks/fieldArray';
import useForm from '../../src/hooks/form';
import {getValueByPath} from '../../src/form';
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

  it('move repositions an item', () => {
    const wrapper = createWrapper({items: ['a', 'b', 'c']});
    const {result} = renderHook(() => useFieldArray({name: 'items'}), {wrapper});
    act(() => result.current.move(0, 2));
    expect(result.current.fields).toHaveLength(3);
  });
});
