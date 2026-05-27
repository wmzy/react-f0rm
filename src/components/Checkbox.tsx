import * as React from 'react';
import {CheckboxGroupProvider, useCheckboxGroupContext} from '../context';
import useField from '../hooks/field';
import type {Name} from '../path';

interface GroupProps {
  children: React.ReactNode;
  name: Name;
  form?: any;
  initialValue?: any;
  validate?: (value: any, meta: {form: any; path: any}) => string | undefined | Promise<string | undefined>;
  [key: string]: any;
}

export function Group({children, ...props}: GroupProps) {
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

interface ItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: any;
}

export function Item({value, ...props}: ItemProps) {
  const {valueSet, onChange, error, ...rest} = useCheckboxGroupContext();

  return (
    <input
      {...rest}
      {...props}
      type="checkbox"
      checked={valueSet.has(value)}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        valueSet[e.target.checked ? 'add' : 'delete'](value);
        onChange(valueSet);
      }}
    />
  );
}
