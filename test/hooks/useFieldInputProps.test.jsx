// useField's inputProps: the spreadable DOM-boundary adapter over the
// headless handlers — `<input {...field.inputProps} />` binds value,
// event extraction, blur, focus channel, disabled and the error a11y
// chain in one spread. The headless value/onChange/onBlur stay untouched
// for custom controls that hand raw values.
import {describe, it, expect} from 'vitest';
import {
  renderHook,
  render,
  act,
  fireEvent,
  screen
} from '@testing-library/react';
import React from 'react';
import useField from '../../src/hooks/field';
import useForm from '../../src/hooks/form';
import {FormProvider} from '../../src/context';
import createForm, {getValue, setError, setDisabled} from '../../src/form';

function createWrapper(initialValues) {
  return function Wrapper({children}) {
    const form = useForm({initialValues});
    return <FormProvider value={form}>{children}</FormProvider>;
  };
}

describe('useField inputProps', () => {
  it('carries name/value/onChange/onBlur/ref/disabled for a controlled input', () => {
    const {result} = renderHook(() => useField({name: 'name'}), {
      wrapper: createWrapper({name: 'test'})
    });
    const props = result.current.inputProps;
    expect(props.name).toBe('["name"]');
    expect(props.value).toBe('test');
    expect(props.disabled).toBe(false);
    expect(typeof props.onChange).toBe('function');
    expect(typeof props.onBlur).toBe('function');
    expect(typeof props.ref).toBe('function');
    expect(props.defaultValue).toBeUndefined();
    expect(props.checked).toBeUndefined();
  });

  it('onChange extracts e.target.value and writes through the user-change pipeline', () => {
    const {result} = renderHook(() => useField({name: 'name'}), {
      wrapper: createWrapper({name: ''})
    });
    act(() => result.current.inputProps.onChange({target: {value: 'typed'}}));
    expect(result.current.value).toBe('typed');
  });

  it('drives a real input: value sync and change events both flow', () => {
    const form = createForm({initialValues: {email: ''}});
    const wrapper = ({children}) => (
      <FormProvider value={form}>{children}</FormProvider>
    );
    function Probe() {
      const {inputProps} = useField({name: 'email'});
      return <input {...inputProps} data-testid="email" />;
    }
    render(<Probe />, {wrapper});
    const input = screen.getByTestId('email');
    fireEvent.change(input, {target: {value: 'a@b.c'}});
    expect(input.value).toBe('a@b.c');
    expect(getValue(form, 'email')).toBe('a@b.c');
  });

  it('uncontrolled mode spreads defaultValue instead of value', () => {
    const {result} = renderHook(
      () => useField({name: 'name', uncontrolled: true}),
      {wrapper: createWrapper({name: 'test'})}
    );
    expect(result.current.inputProps.defaultValue).toBe('test');
    expect(result.current.inputProps.value).toBeUndefined();
  });

  it("type:'checkbox' spreads checked and extracts checked", () => {
    const {result} = renderHook(
      () => useField({name: 'agree', type: 'checkbox', initialValue: false}),
      {wrapper: createWrapper({})}
    );
    expect(result.current.inputProps.checked).toBe(false);
    expect(result.current.inputProps.value).toBeUndefined();
    act(() =>
      result.current.inputProps.onChange({
        target: {type: 'checkbox', checked: true}
      })
    );
    expect(result.current.value).toBe(true);
  });

  it("type:'file' spreads no value prop at all", () => {
    const {result} = renderHook(() => useField({name: 'file', type: 'file'}), {
      wrapper: createWrapper({})
    });
    const props = result.current.inputProps;
    expect(props.value).toBeUndefined();
    expect(props.defaultValue).toBeUndefined();
  });

  it('eventToValue customizes the extraction while the headless onChange stays raw', () => {
    const {result} = renderHook(
      () => useField({name: 'name', eventToValue: e => e.custom}),
      {wrapper: createWrapper({name: ''})}
    );
    act(() => result.current.inputProps.onChange({custom: 'raw'}));
    expect(result.current.value).toBe('raw');
    // The headless handler keeps taking values, not events.
    act(() => result.current.onChange('direct'));
    expect(result.current.value).toBe('direct');
  });

  it('valueAsNumber stores the typed accessor', () => {
    const {result} = renderHook(
      () => useField({name: 'age', valueAsNumber: true}),
      {wrapper: createWrapper({age: ''})}
    );
    act(() =>
      result.current.inputProps.onChange({target: {valueAsNumber: 42}})
    );
    expect(result.current.value).toBe(42);
  });

  it('completes the aria chain on error and clears it with the error', () => {
    const form = createForm({initialValues: {name: ''}});
    const wrapper = ({children}) => (
      <FormProvider value={form}>{children}</FormProvider>
    );
    const {result} = renderHook(() => useField({form, name: 'name'}), {
      wrapper
    });
    expect(result.current.inputProps['aria-invalid']).toBeUndefined();
    expect(result.current.inputProps['aria-describedby']).toBeUndefined();

    act(() => setError(form, 'name', 'required'));
    expect(result.current.inputProps['aria-invalid']).toBe(true);
    // The library-wide convention: render the message element with this id.
    expect(result.current.inputProps['aria-describedby']).toBe('name');

    act(() => setError(form, 'name', undefined));
    expect(result.current.inputProps['aria-invalid']).toBeUndefined();
    expect(result.current.inputProps['aria-describedby']).toBeUndefined();
  });

  it('inputProps.ref is the focusRef focus channel', () => {
    const {result} = renderHook(() => useField({name: 'name'}), {
      wrapper: createWrapper({name: ''})
    });
    expect(result.current.inputProps.ref).toBe(result.current.focusRef);
  });

  it('disabled follows the merged form-level flag live', () => {
    const form = createForm({initialValues: {name: ''}});
    const wrapper = ({children}) => (
      <FormProvider value={form}>{children}</FormProvider>
    );
    const {result} = renderHook(() => useField({form, name: 'name'}), {
      wrapper
    });
    expect(result.current.inputProps.disabled).toBe(false);
    act(() => setDisabled(form, true));
    expect(result.current.inputProps.disabled).toBe(true);
  });
});
