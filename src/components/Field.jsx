import * as React from 'react';
import useField from '../hooks/field';

export default function Field({render, ...props}) {
  const field = useField(props);
  return render(field);
}

export function Checkbox(props) {
  const {value, onChange, error, ...rest} = useField(props);
  return (
    <input
      {...rest}
      type="checkbox"
      checked={!!value}
      onChange={e => onChange(e.target.checked)}
    />
  );
}
