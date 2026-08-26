import * as React from 'react';
import {on} from '@for-fun/event-emitter';
import useField from '../hooks/field';
import type {Validator} from '../hooks/validate';
import type {Form, ValidationMode} from '../form';
import type {FieldRules} from '../rules';
import type {Name, Path} from '../path';
import createPath from '../path';
import type {FieldPath, PathValueOf} from '../types';

/**
 * Props shared by Field/Checkbox/Select. Generic so a typed form flows into
 * the `validate` callback: with `form` (a `Form<Values>`) and `name`
 * (a `FieldPath<Values>`) provided, `validate` receives the value at that
 * path — `PathValueOf<Values, P>` — instead of `any`. The defaults keep the
 * bare `<Field name="x" />` (context-resolved, untyped) call sites exactly
 * as permissive as before.
 */
interface UseFieldOptions<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
> {
  form?: Form<TValues>;
  name?: TPath;
  initialValue?: any;
  shouldUnregister?: boolean;
  /**
   * Field-level validator. The value argument is typed when the field is
   * tied to a typed form (via the `form` prop); the return shape mirrors
   * {@link Validator} — an error (string / FieldError / mixed array) or
   * undefined when valid, possibly a Promise for async validation. The
   * second argument carries the validation context (`meta.signal` aborts
   * when the round is superseded).
   */
  validate?: (
    value: PathValueOf<TValues, TPath>,
    meta: {form: Form; path: Path; signal: AbortSignal}
  ) => ReturnType<Validator>;
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
  /**
   * Field-level validation mode override: this field validates on its own
   * schedule instead of the form's `mode` (other fields are unaffected);
   * the form's `reValidateMode` still governs re-validation once the
   * field has an error. Passed through to useField, never spread onto
   * the DOM element.
   */
  mode?: ValidationMode;
  [key: string]: any;
}

interface FieldProps<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
> extends UseFieldOptions<TValues, TPath> {
  as?: React.ComponentType<any>;
  asProps?: Record<string, any>;
  eventToValue?: (e: any) => any;
  valueToProps?: (value: any) => Record<string, any>;
  /**
   * Optional error renderer. When provided and the field has an error,
   * Field renders `<span id={id} role="alert">{renderError(error, id)}</span>`
   * next to the input. The input's aria-describedby points at that span's
   * id (the same `fieldErrorId(name)` derivation) whenever the field has
   * an error — with or without renderError — so custom error components
   * that render the element themselves (using `fieldErrorId`) get the
   * wiring for free.
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

/**
 * The error-message element id a field's `aria-describedby` points at —
 * `fieldErrorId('a[0].b')` is `'a-0-b'`, the same id `Field`'s built-in
 * `renderError` span carries. This is the library-level wiring convention:
 * whenever a bound field (Field/Checkbox/Select) has an error it sets
 * `aria-invalid` and describes the element with this id, so a custom error
 * component only needs `<span id={fieldErrorId(name)} role="alert">` to
 * complete the accessible-name chain for screen readers.
 * @param name the same field name passed to the bound component
 */
export function fieldErrorId(name: Name): string {
  return errorIdFromKey(createPath(name).key);
}

/**
 * The callable shape of {@link Field}: `form` + `name` flow their generics
 * into `validate`'s value argument (`PathValueOf<TValues, TPath>`). A named
 * interface rather than an inline `as <TValues, ...>() => ...` signature —
 * same types, and the inline form trips no-use-before-define on the type
 * parameters.
 */
interface FieldComponent {
  <
    TValues extends Record<string, any> = any,
    TPath extends FieldPath<TValues> | Name = Name
  >(
    props: FieldProps<TValues, TPath> & React.RefAttributes<HTMLInputElement>
  ): React.ReactElement | null;
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
      mode,
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
      mode,
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
    // Error-id convention: a field with an error always describes the
    // element carrying fieldErrorId(name) — renderError renders it inline
    // below, custom error components derive the same id through the
    // exported fieldErrorId. A user-provided aria-describedby survives:
    // its ids are joined ahead of the error id.
    const describedBy = error
      ? [props['aria-describedby'], errorId].filter(Boolean).join(' ')
      : props['aria-describedby'];

    return (
      <>
        <Component
          {...props}
          name={fieldKey}
          onBlur={onBlur}
          {...asProps}
          {...(valueToProps ? valueToProps(value) : {value})}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={describedBy}
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
) as FieldComponent;

interface CheckboxProps<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
> extends UseFieldOptions<TValues, TPath> {}

/**
 * Callable shape of {@link Checkbox}: the same form-typed `validate`
 * inference contract as {@link FieldComponent}.
 */
interface CheckboxComponent {
  <
    TValues extends Record<string, any> = any,
    TPath extends FieldPath<TValues> | Name = Name
  >(
    props: CheckboxProps<TValues, TPath> & React.RefAttributes<HTMLInputElement>
  ): React.ReactElement | null;
}

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
      mode,
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
      disabled,
      mode
    });
    // Same error-id convention as Field: the checkbox describes the
    // fieldErrorId(name) element whenever it has an error.
    return (
      <input
        {...props}
        name={fieldKey}
        onBlur={onBlur}
        type="checkbox"
        checked={!!value}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={
          error
            ? [props['aria-describedby'], errorIdFromKey(fieldKey)]
                .filter(Boolean)
                .join(' ')
            : props['aria-describedby']
        }
        disabled={isDisabled}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.checked)
        }
        ref={ref}
      />
    );
  }
) as CheckboxComponent;

interface SelectProps<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
> extends UseFieldOptions<TValues, TPath> {
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

/**
 * Callable shape of {@link Select}: the same form-typed `validate`
 * inference contract as {@link FieldComponent}.
 */
interface SelectComponent {
  <
    TValues extends Record<string, any> = any,
    TPath extends FieldPath<TValues> | Name = Name
  >(
    props: SelectProps<TValues, TPath> & React.RefAttributes<HTMLSelectElement>
  ): React.ReactElement | null;
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
      mode,
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
      disabled,
      mode
    });
    // Same error-id convention as Field: the select describes the
    // fieldErrorId(name) element whenever it has an error.
    return (
      <select
        {...props}
        name={fieldKey}
        onBlur={onBlur}
        multiple={multiple}
        value={toSelectValue(multiple, value)}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={
          error
            ? [props['aria-describedby'], errorIdFromKey(fieldKey)]
                .filter(Boolean)
                .join(' ')
            : props['aria-describedby']
        }
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
) as SelectComponent;
