// Disabled subtree propagation: a field declared `disabled: true` disables
// every descendant field (react-hook-form subtree semantics), a descendant
// declares `disabled: false` to opt back out, and the form-level flag
// (`createForm({disabled})` / setDisabled) still disables everything —
// opt-out cannot escape it (the library's documented rule).
import {describe, it, expect} from 'vitest';
import {renderHook, render, act, screen} from '@testing-library/react';
import React from 'react';
import useField from '../../src/hooks/field';
import {FormProvider} from '../../src/context';
import createForm, {setDisabled} from '../../src/form';
import {Field} from '../../src/components/Field';

const wrapper =
  form =>
  ({children}) => <FormProvider value={form}>{children}</FormProvider>;

describe('disabled subtree propagation', () => {
  it('a parent disabled:true disables its descendants at any depth', () => {
    const form = createForm({
      initialValues: {user: {name: '', address: {city: ''}}, other: ''}
    });
    const parent = renderHook(() =>
      useField({form, name: 'user', disabled: true})
    );
    const child = renderHook(() => useField({form, name: 'user.name'}));
    const grandchild = renderHook(() =>
      useField({form, name: 'user.address.city'})
    );
    const sibling = renderHook(() => useField({form, name: 'other'}));
    expect(parent.result.current.disabled).toBe(true);
    expect(child.result.current.disabled).toBe(true);
    expect(grandchild.result.current.disabled).toBe(true);
    // Subtrees outside the disabled branch stay enabled.
    expect(sibling.result.current.disabled).toBe(false);
  });

  it("a descendant disabled:false opts out of the ancestor's flag", () => {
    const form = createForm({
      initialValues: {user: {name: '', email: ''}}
    });
    renderHook(() => useField({form, name: 'user', disabled: true}));
    const optedIn = renderHook(() => useField({form, name: 'user.name'}));
    const optedOut = renderHook(() =>
      useField({form, name: 'user.email', disabled: false})
    );
    expect(optedIn.result.current.disabled).toBe(true);
    expect(optedOut.result.current.disabled).toBe(false);
  });

  it('the form-level flag disables opt-out descendants too', () => {
    const form = createForm({
      initialValues: {user: {name: '', email: ''}}
    });
    const parent = renderHook(() => useField({form, name: 'user'}));
    const optedOut = renderHook(() =>
      useField({form, name: 'user.email', disabled: false})
    );
    expect(parent.result.current.disabled).toBe(false);
    expect(optedOut.result.current.disabled).toBe(false);
    act(() => setDisabled(form, true));
    expect(parent.result.current.disabled).toBe(true);
    expect(optedOut.result.current.disabled).toBe(true);
  });

  it('flipping the option re-renders descendants in both directions', () => {
    const form = createForm({initialValues: {user: {name: ''}}});
    const parent = renderHook(
      ({disabled}) => useField({form, name: 'user', disabled}),
      {initialProps: {disabled: false}}
    );
    const child = renderHook(() => useField({form, name: 'user.name'}));
    expect(child.result.current.disabled).toBe(false);
    act(() => parent.rerender({disabled: true}));
    expect(child.result.current.disabled).toBe(true);
    act(() => parent.rerender({disabled: false}));
    expect(child.result.current.disabled).toBe(false);
  });

  it('mount order does not matter: a parent mounted after its child still propagates', () => {
    const form = createForm({initialValues: {user: {name: ''}}});
    const child = renderHook(() => useField({form, name: 'user.name'}));
    expect(child.result.current.disabled).toBe(false);
    renderHook(() => useField({form, name: 'user', disabled: true}));
    expect(child.result.current.disabled).toBe(true);
  });

  it('flows through the bound components onto the DOM elements', () => {
    const form = createForm({
      initialValues: {user: {name: '', email: ''}}
    });
    render(
      <>
        <Field form={form} name="user" disabled data-testid="parent" />
        <Field form={form} name="user.name" data-testid="child" />
        <Field
          form={form}
          name="user.email"
          disabled={false}
          data-testid="opted-out"
        />
      </>,
      {wrapper: wrapper(form)}
    );
    expect(screen.getByTestId('parent').disabled).toBe(true);
    expect(screen.getByTestId('child').disabled).toBe(true);
    expect(screen.getByTestId('opted-out').disabled).toBe(false);
  });
});
