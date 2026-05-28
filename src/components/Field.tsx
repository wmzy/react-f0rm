import * as React from 'react';
import useField from '../hooks/field';
import type {Name} from '../path';

interface UseFieldOptions {
  form?: any;
  name?: Name;
  initialValue?: any;
  validate?: (
    value: any,
    meta: {form: any; path: any}
  ) => string | undefined | Promise<string | undefined>;
  [key: string]: any;
}

interface FieldProps extends UseFieldOptions {
  as?: React.ComponentType<any>;
  asProps?: Record<string, any>;
  eventToValue?: (e: any) => any;
  valueToProps?: (value: any) => Record<string, any>;
}

const buildInError = Symbol('buildInError');

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({validate, eventToValue, initialValue, name, asProps, ...props}, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const mergedRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        setRef(ref, node);
      },
      [ref]
    );
    const {as, value, valueToProps, onChange, error, ...rest} = useField({
      ...props,
      name: name!,
      initialValue,
      validate: (...params: [any, any]) => {
        if (innerRef.current?.checkValidity() === false)
          return buildInError as any;
        if (validate) return validate(...params);
      }
    });
    const Component = as || 'input';

    React.useEffect(() => {
      if (!innerRef.current) return;
      if ((error as any) === buildInError) {
        innerRef.current.setCustomValidity('');
        innerRef.current.reportValidity();
        return;
      }

      if (typeof error === 'string') {
        innerRef.current.setCustomValidity(error);
        innerRef.current.reportValidity();
      }
    }, [error]);

    const toValue = eventToValue ?? ((e: any) => e.target.value);

    return (
      <Component
        {...rest}
        {...asProps}
        {...(valueToProps ? valueToProps(value) : {value})}
        onChange={(e: any) => onChange(toValue(e))}
        ref={mergedRef}
      />
    );
  }
);

interface CheckboxProps extends UseFieldOptions {}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({name, ...props}, ref) => {
    const {value, onChange, error, ...rest} = useField({...props, name: name!});
    return (
      <input
        {...rest}
        type="checkbox"
        checked={!!value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.checked)
        }
        ref={ref}
      />
    );
  }
);
