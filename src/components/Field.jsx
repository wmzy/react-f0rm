import * as React from 'react';
import useField from '../hooks/field';

const buildInError = Symbol('buildInError');

export function Field({validate, eventToValue, initialValue, ...props}) {
  const ref = React.useRef(null);
  const {as, value, valueToProps, onChange, error, ...rest} =
    useField({
      ...props,
      initialValue: initialValue ?? '',
      validate: (...params) => {
        if (false === ref.current?.checkValidity()) return buildInError;
        if (validate) return validate(...params);
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
