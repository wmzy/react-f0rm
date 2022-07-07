import * as React from 'react';
import {CheckboxGroupProvider, useCheckboxGroupContext} from '../context';
import useField from '../hooks/field';

export function Group({children, ...props}) {
  const {value, onChange, ...rest} = useField(props);
  return (
    <CheckboxGroupProvider
      value={{
        valueSet: new Set(value),
        onChange: valueSet => onChange(Array.from(valueSet)),
        ...rest
      }}
    >
      {children}
    </CheckboxGroupProvider>
  );
}

export function Item({value, ...props}) {
  const {valueSet, onChange, error, ...rest} = useCheckboxGroupContext();

  return (
    <input
      {...rest}
      {...props}
      type="checkbox"
      checked={valueSet.has(value)}
      onChange={e => {
        valueSet[e.target.checked ? 'add' : 'delete'](value);
        onChange(valueSet);
      }}
    />
  );
}
