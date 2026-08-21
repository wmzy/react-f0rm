import * as React from 'react';
import {on} from '@for-fun/event-emitter';
import useField from '../hooks/field';
import type {Validator} from '../hooks/validate';
import type {Name} from '../path';

interface UseFieldOptions {
  form?: any;
  name?: Name;
  initialValue?: any;
  validate?: Validator;
  [key: string]: any;
}

interface FieldProps extends UseFieldOptions {
  as?: React.ComponentType<any>;
  asProps?: Record<string, any>;
  eventToValue?: (e: any) => any;
  valueToProps?: (value: any) => Record<string, any>;
  /**
   * Optional error renderer. When provided and the field has an error,
   * Field renders `<span id={id} role="alert">{renderError(error, id)}</span>`
   * next to the input and points the input's aria-describedby at that span.
   * When omitted, no extra element is rendered (headless) and no
   * aria-describedby is attached, avoiding dangling id references.
   */
  renderError?: (error: string, id: string) => React.ReactNode;
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

/**
 * Converts a path key (the JSON.stringify'd path segments, e.g. '["a","0"]')
 * into a valid HTML id ('a-0'): quotes, brackets, commas and whitespace
 * become hyphens; leading/trailing hyphens are trimmed. Falls back to
 * 'field' if nothing remains.
 */
function errorIdFromKey(key: string): string {
  const id = key.replace(/["'[\],\s]+/g, '-').replace(/^-+|-+$/g, '');
  return id || 'field';
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  (
    {
      validate,
      eventToValue,
      initialValue,
      name,
      asProps,
      renderError,
      ...props
    },
    ref
  ) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const [nativeInvalidCount, setNativeInvalidCount] = React.useState(0);
    const mergedRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        setRef(ref, node);
      },
      [ref]
    );
    const {
      as,
      value,
      valueToProps,
      onChange,
      error,
      errorObject,
      form,
      ...rest
    } = useField({
      ...props,
      name: name!,
      initialValue,
      validate: (...params: [any, any]) => {
        const el = innerRef.current;
        if (el && typeof el.checkValidity === 'function') {
          el.setCustomValidity('');
          if (el.checkValidity() === false) {
            setNativeInvalidCount(count => count + 1);
            return undefined;
          }
        }
        if (validate) return validate(...params);
      }
    });
    const Component = as || 'input';

    React.useEffect(() => {
      const el = innerRef.current;
      if (!el || typeof el.setCustomValidity !== 'function') return;
      if (typeof error === 'string') {
        el.setCustomValidity(error);
        el.reportValidity();
      } else {
        el.setCustomValidity('');
      }
    }, [error]);

    React.useEffect(() => {
      if (nativeInvalidCount > 0) innerRef.current?.reportValidity();
    }, [nativeInvalidCount]);

    // Focus this input when a failed submit names it as the first error:
    // handleSubmit emits 'focusError' with the first error's path key.
    React.useEffect(
      () =>
        on(form.emitter, 'focusError', (key: string) => {
          if (key !== rest.name) return;
          const el = innerRef.current;
          if (el && typeof el.focus === 'function') el.focus();
        }),
      [form, rest.name]
    );

    const toValue = eventToValue ?? ((e: any) => e.target.value);

    // rest.name is the field's path key (set by useField), e.g. '["a","0"]'.
    const errorId = errorIdFromKey(rest.name);

    return (
      <>
        <Component
          aria-invalid={error ? true : undefined}
          aria-describedby={error && renderError ? errorId : undefined}
          {...rest}
          {...asProps}
          {...(valueToProps ? valueToProps(value) : {value})}
          onChange={(e: any) => onChange(toValue(e))}
          ref={mergedRef}
        />
        {error && renderError ? (
          <span id={errorId} role="alert">
            {renderError(error, errorId)}
          </span>
        ) : null}
      </>
    );
  }
);

interface CheckboxProps extends UseFieldOptions {}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({name, ...props}, ref) => {
    const {value, onChange, error, errorObject, form, ...rest} = useField({
      ...props,
      name: name!
    });
    return (
      <input
        aria-invalid={error ? true : undefined}
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

interface SelectProps extends UseFieldOptions {
  multiple?: boolean;
  children?: React.ReactNode;
}

/**
 * Controlled <select>. Options are passed as children (<option> elements).
 * Single-select stores the selected option's value as a string, matching
 * Field's default event-to-value behavior; a multiple select stores the
 * values of all selected options as a string array.
 */
/** Normalize a field value for a <select>: multiple wants a string array,
 * single-select wants a string. */
function toSelectValue(
  multiple: boolean | undefined,
  value: any
): string | string[] {
  if (multiple) return Array.isArray(value) ? value : [];
  return value ?? '';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({name, multiple, children, ...props}, ref) => {
    const {value, onChange, error, errorObject, form, ...rest} = useField({
      ...props,
      name: name!
    });
    return (
      <select
        aria-invalid={error ? true : undefined}
        {...rest}
        multiple={multiple}
        value={toSelectValue(multiple, value)}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
          onChange(
            multiple
              ? Array.from(e.target.selectedOptions, option => option.value)
              : e.target.value
          )
        }
        ref={ref}
      >
        {children}
      </select>
    );
  }
);
