import * as React from 'react';
import {CheckboxGroupProvider, useCheckboxGroupContext} from '../context';
import useField from '../hooks/field';
import type {Validator} from '../hooks/validate';
import type {Name} from '../path';

interface GroupProps {
  children: React.ReactNode;
  name: Name;
  form?: any;
  initialValue?: any;
  validate?: Validator;
  [key: string]: any;
}

interface ItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: any;
}

/**
 * Shared implementation of the Radio and Checkbox group components: a
 * `Group` binds one array-valued field and publishes its value as a Set
 * through {@link CheckboxGroupContext}; an `Item` toggles its `value` in
 * that set and renders an input of the given `type`.
 *
 * The two components differ only in the input type — everything else
 * (context, aria wiring, toggle logic) is byte-identical, so both are
 * thin factories over this builder.
 */
export function createGroupItem(type: 'radio' | 'checkbox') {
  function Group({children, ...props}: GroupProps) {
    const {value, onChange, ...rest} = useField(props);
    return (
      <CheckboxGroupProvider
        value={{
          valueSet: new Set(value),
          onChange: (valueSet: Set<any>) => onChange(Array.from(valueSet)),
          ...rest
        }}
      >
        {children}
      </CheckboxGroupProvider>
    );
  }

  function Item({value, ...props}: ItemProps) {
    const {valueSet, onChange, error, errorObject, errors, ...rest} =
      useCheckboxGroupContext();

    return (
      <input
        aria-invalid={error ? true : undefined}
        {...rest}
        {...props}
        type={type}
        checked={valueSet.has(value)}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          valueSet[e.target.checked ? 'add' : 'delete'](value);
          onChange(valueSet);
        }}
      />
    );
  }

  return {Group, Item};
}
