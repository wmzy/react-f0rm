import * as React from 'react';
import useField from '../hooks/field';

export default function Field({render, ...props}) {
  const field = useField(props);
  return render(field);
}

export function FieldAs({as: Component, ...props}) {
  const field = useField(props);
  return <Component {...field} />;
}

const buildInError = Symbol('buildInError');

export function Input({validate, eventToValue, defaultValue, ...props}) {
  const ref = React.useRef(null);
  const {as, value, valueToProps, onChange, error, ...rest} =
    useField({
      ...props,
      defaultValue: defaultValue ?? '',
      validate: val => {
        if (false === ref.current?.checkValidity()) return buildInError;
        if (validate) return validate(val);
      }
    });
  const Component = as || 'input';

  React.useEffect(() => {
    if (!ref.current) return;
    if (error === buildInError) {
      ref.current.setCustomValidity('');
      ref.current.reportValidity();
      return;
    }

    if (typeof error === 'string') {
      ref.current.setCustomValidity(error);
      ref.current.reportValidity();
    }
  }, [error]);

  const toValue = eventToValue ?? (e => e.target.value);

  return (
    <Component
      {...rest}
      {...(valueToProps ? valueToProps(value) : {value})}
      onChange={e => onChange(toValue(e))}
      ref={ref}
    />
  );
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
