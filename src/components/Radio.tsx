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
  const {valueSet, onChange, error, errorObject, ...rest} =
    useCheckboxGroupContext();

  return (
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- aria-invalid is a global ARIA attribute, valid on role=radio
    <input
      aria-invalid={error ? true : undefined}
      {...rest}
      {...props}
      type="radio"
      checked={valueSet.has(value)}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        valueSet[e.target.checked ? 'add' : 'delete'](value);
        onChange(valueSet);
      }}
    />
  );
}
