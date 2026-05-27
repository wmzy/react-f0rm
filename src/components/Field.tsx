import * as React from 'react';
import useField from '../hooks/field';
import type {Name} from '../path';

interface UseFieldOptions {
  form?: any;
  name: Name;
  initialValue?: any;
  validate?: (
    value: any,
    meta: {form: any; path: any}
  ) => string | undefined | Promise<string | undefined>;
  [key: string]: any;
}

interface FieldProps extends UseFieldOptions {
  as?: React.ComponentType<any>;
  eventToValue?: (e: any) => any;
  valueToProps?: (value: any) => Record<string, any>;
}

const buildInError = Symbol('buildInError');

export function Field({
  validate,
  eventToValue,
  initialValue,
  ...props
}: FieldProps) {
  const ref = React.useRef<HTMLInputElement | null>(null);
  const {as, value, valueToProps, onChange, error, ...rest} = useField({
    ...props,
    initialValue,
    validate: (...params: [any, any]) => {
      if (false === ref.current?.checkValidity()) return buildInError as any;
      if (validate) return validate(...params);
    }
  });
  const Component = as || 'input';

  React.useEffect(() => {
    if (!ref.current) return;
    if ((error as any) === buildInError) {
      ref.current.setCustomValidity('');
      ref.current.reportValidity();
      return;
    }

    if (typeof error === 'string') {
      ref.current.setCustomValidity(error);
      ref.current.reportValidity();
    }
  }, [error]);

  const toValue = eventToValue ?? ((e: any) => e.target.value);

  return (
    <Component
      {...rest}
      {...(valueToProps ? valueToProps(value) : {value})}
      onChange={(e: any) => onChange(toValue(e))}
      ref={ref}
    />
  );
}

interface CheckboxProps extends UseFieldOptions {}

export function Checkbox(props: CheckboxProps) {
  const {value, onChange, error, ...rest} = useField(props);
  return (
    <input
      {...rest}
      type="checkbox"
      checked={!!value}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        onChange(e.target.checked)
      }
    />
  );
}
