import * as React from 'react';
import {on} from '@for-fun/event-emitter';
import useField from '../hooks/field';
import type {Validator} from '../hooks/validate';
import type {FieldRules} from '../rules';
import type {Name} from '../path';

interface UseFieldOptions {
  form?: any;
  name?: Name;
  initialValue?: any;
  shouldUnregister?: boolean;
  validate?: Validator;
  /**
   * Declarative rules (required/min/max/minLength/maxLength/pattern),
   * compiled into a validator that runs before `validate`; failures land
   * in the form's error state. Passed through to useField — like
   * validateDebounce it is never spread onto the DOM element.
   */
  rules?: FieldRules;
  /**
   * Milliseconds to debounce this field's validation kicks. Defaults to 0
   * (validate immediately); only the last kick inside the window runs the
   * validator, and `trigger` waits the window out. Passed through to
   * useField/useValidate.
   */
  validateDebounce?: number;
  /**
   * Disable this field's control: OR-ed with the form-level flag
   * (`createForm({disabled})` / `setDisabled`) — a field cannot opt out
   * of a disabled form. Passed through to useField, like every option,
   * never spread onto the DOM element from props.
   */
  disabled?: boolean;
  /**
   * Milliseconds to delay showing a newly appearing error (render layer
   * only — `aria-invalid`/`renderError` wait out the window while the
   * form's error state stays immediate for trigger/submit). An error
   * that clears inside the window never shows; once visible, error
   * changes apply immediately. Passed through to useField.
   */
  delayError?: number;
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
      as,
      valueToProps,
      form: formProp,
      shouldUnregister,
      rules,
      validateDebounce,
      disabled,
      delayError,
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
    // Only declared options go into the hook; DOM props stay in `props` and
    // are spread onto the element below — useField no longer echoes unknown
    // options back, so `as`/`valueToProps`/DOM props are destructured here
    // instead of being fished out of its result.
    const {
      value,
      onChange,
      onBlur,
      error,
      form,
      name: fieldKey,
      disabled: isDisabled
    } = useField({
      name: name!,
      form: formProp,
      initialValue,
      shouldUnregister,
      rules,
      validateDebounce,
      delayError,
      disabled,
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
    // setFocus rides the same channel and may pass {shouldSelect} as a
    // second, optional argument to select the text after focusing.
    React.useEffect(
      () =>
        on(
          form.emitter,
          'focusError',
          (key: string, options?: {shouldSelect?: boolean}) => {
            if (key !== fieldKey) return;
            const el = innerRef.current;
            if (!el || typeof el.focus !== 'function') return;
            el.focus();
            if (options?.shouldSelect && typeof el.select === 'function') {
              el.select();
            }
          }
        ),
      [form, fieldKey]
    );

    const toValue = eventToValue ?? ((e: any) => e.target.value);

    // fieldKey is the field's path key (set by useField), e.g. '["a","0"]'.
    const errorId = errorIdFromKey(fieldKey);

    return (
      <>
        <Component
          aria-invalid={error ? true : undefined}
          aria-describedby={error && renderError ? errorId : undefined}
          {...props}
          name={fieldKey}
          onBlur={onBlur}
          {...asProps}
          {...(valueToProps ? valueToProps(value) : {value})}
          disabled={isDisabled}
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
  (
    {
      name,
      form,
      initialValue,
      shouldUnregister,
      validate,
      rules,
      validateDebounce,
      disabled,
      delayError,
      ...props
    },
    ref
  ) => {
    const {
      value,
      onChange,
      onBlur,
      error,
      name: fieldKey,
      disabled: isDisabled
    } = useField({
      name: name!,
      form,
      initialValue,
      shouldUnregister,
      validate,
      rules,
      validateDebounce,
      delayError,
      disabled
    });
    return (
      <input
        aria-invalid={error ? true : undefined}
        {...props}
        name={fieldKey}
        onBlur={onBlur}
        type="checkbox"
        checked={!!value}
        disabled={isDisabled}
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
  (
    {
      name,
      multiple,
      children,
      form,
      initialValue,
      shouldUnregister,
      validate,
      rules,
      validateDebounce,
      disabled,
      delayError,
      ...props
    },
    ref
  ) => {
    const {
      value,
      onChange,
      onBlur,
      error,
      name: fieldKey,
      disabled: isDisabled
    } = useField({
      name: name!,
      form,
      initialValue,
      shouldUnregister,
      validate,
      rules,
      validateDebounce,
      delayError,
      disabled
    });
    return (
      <select
        aria-invalid={error ? true : undefined}
        {...props}
        name={fieldKey}
        onBlur={onBlur}
        multiple={multiple}
        value={toSelectValue(multiple, value)}
        disabled={isDisabled}
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
