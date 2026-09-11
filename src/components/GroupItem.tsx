import * as React from 'react';
import {CheckboxGroupProvider, useCheckboxGroupContext} from '../context';
import useField from '../hooks/field';
import type {Validator} from '../hooks/validate';
import type {Name} from '../path';

export type GroupProps = {
  children: React.ReactNode;
  name: Name;
  form?: any;
  initialValue?: any;
  validate?: Validator;
  [key: string]: any;
};

export type ItemProps = React.InputHTMLAttributes<HTMLInputElement> & {
  value: any;
};

/** Shared Radio/Checkbox group factory: `Group` binds one array-valued
 * field and publishes it as a Set; `Item` toggles its `value` and renders
 * an input of `type`. The two differ only in input type. */
export function createGroupItem(type: 'radio' | 'checkbox'): {
  Group: (props: GroupProps) => React.JSX.Element;
  Item: (props: ItemProps) => React.JSX.Element;
} {
  function Group({children, ...props}: GroupProps): React.JSX.Element {
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

  function Item({value, ...props}: ItemProps): React.JSX.Element {
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
