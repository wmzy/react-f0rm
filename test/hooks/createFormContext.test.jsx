// createFormContext() scenarios — genuinely new API surface from the Wave 2
// "CreateFormContext" task: per-instance contexts with bound hooks. The
// default FormProvider/useField/useFieldArray regressions live here too,
// because the factory shares their core implementations.
import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import React from 'react';
import {createFormContext, FormProvider} from '../../src/context';
import useField from '../../src/hooks/field';
import useFieldArray from '../../src/hooks/fieldArray';
import useForm from '../../src/hooks/form';
import createForm, {getValues} from '../../src/form';

// Two factory calls must yield two fully independent context bundles.
const OuterCtx = createFormContext();
const InnerCtx = createFormContext();

describe('createFormContext', () => {
  it('scopes nested providers of different forms without cross-talk', () => {
    const outerForm = createForm({initialValues: {profile: {name: 'ada'}}});
    const innerForm = createForm({initialValues: {sku: 'sku-1'}});
    const {result} = renderHook(
      () => ({
        outer: OuterCtx.useField({name: 'profile.name'}),
        inner: InnerCtx.useField({name: 'sku'})
      }),
      {
        wrapper: ({children}) => (
          <OuterCtx.FormProvider form={outerForm}>
            <InnerCtx.FormProvider form={innerForm}>{children}</InnerCtx.FormProvider>
          </OuterCtx.FormProvider>
        )
      }
    );
    expect(result.current.outer.value).toBe('ada');
    expect(result.current.inner.value).toBe('sku-1');
    expect(result.current.outer.form).toBe(outerForm);
    expect(result.current.inner.form).toBe(innerForm);

    // Writing through the inner binding must not leak into the outer form.
    act(() => result.current.inner.onChange('sku-2'));
    expect(result.current.inner.value).toBe('sku-2');
    expect(result.current.outer.value).toBe('ada');
    expect(getValues(innerForm)).toEqual({sku: 'sku-2'});
    expect(getValues(outerForm)).toEqual({profile: {name: 'ada'}});
  });

  it('useFormContext returns the innermost scoped form', () => {
    const outerForm = createForm();
    const innerForm = createForm();
    const {result} = renderHook(() => InnerCtx.useFormContext(), {
      wrapper: ({children}) => (
        <OuterCtx.FormProvider form={outerForm}>
          <InnerCtx.FormProvider form={innerForm}>{children}</InnerCtx.FormProvider>
        </OuterCtx.FormProvider>
      )
    });
    expect(result.current).toBe(innerForm);
  });

  it('useFieldArray binds to the scoped form', () => {
    const innerForm = createForm({initialValues: {tags: ['a']}});
    const {result} = renderHook(() => InnerCtx.useFieldArray({name: 'tags'}), {
      wrapper: ({children}) => (
        <OuterCtx.FormProvider form={createForm()}>
          <InnerCtx.FormProvider form={innerForm}>{children}</InnerCtx.FormProvider>
        </OuterCtx.FormProvider>
      )
    });
    expect(result.current.fields).toHaveLength(1);
    act(() => result.current.append('b'));
    expect(getValues(innerForm)).toEqual({tags: ['a', 'b']});
  });

  it('bound hooks throw without their own provider', () => {
    // Even with a default FormProvider above, a scoped hook finds no value
    // in its own context and must throw the familiar error.
    const wrapper = ({children}) => (
      <FormProvider value={createForm()}>
        <InnerCtx.FormProvider form={createForm()}>{children}</InnerCtx.FormProvider>
      </FormProvider>
    );
    expect(() =>
      renderHook(() => OuterCtx.useField({name: 'a'}), {wrapper})
    ).toThrow('no form provided');
    expect(() => renderHook(() => OuterCtx.useFormContext(), {wrapper})).toThrow(
      'no form provided'
    );
    expect(() =>
      renderHook(() => OuterCtx.useFieldArray({name: 'a'}), {wrapper})
    ).toThrow('no form provided');
  });

  it('keeps the default FormProvider + useField path working (regression)', () => {
    const wrapper = ({children}) => {
      const form = useForm({initialValues: {name: 'test'}});
      return <FormProvider value={form}>{children}</FormProvider>;
    };
    const {result} = renderHook(() => useField({name: 'name'}), {wrapper});
    expect(result.current.value).toBe('test');
    act(() => result.current.onChange('changed'));
    expect(result.current.value).toBe('changed');
  });
});
