import * as React from 'react';
import useField from '../hooks/field';
import type {UseFieldOptions as HookFieldOptions} from '../hooks/field';
import {errorIdFromKey} from '../errorId';
export {fieldErrorId} from '../errorId';
import {FormContext} from '../context';
import {rulesToConstraintAttrs} from '../rules';
import type {FieldRules} from '../rules';
import type {StandardSchemaV1} from '../standardSchema';
import {hasStandardProps, schemaToFieldValidator} from '../standardSchema';
import type {AnyPath} from '../types';
import {eventToValueOrDefault} from '../util';

/** Dev-only flag, replaced at build time (rollup); defined in vitest.config.ts. */
declare const __DEV__: boolean;

/** Props shared by Field/Checkbox/Select: the hook options minus the
 * required `name` (the components type it optional) and `validateDeps`
 * (the components do not forward it), plus the index signature that lets
 * DOM props flow through. */
type UseFieldOptions<
  TValues extends Record<string, any> = any,
  TPath extends AnyPath<TValues> = AnyPath<TValues>
> = Omit<HookFieldOptions<TValues, TPath>, 'name' | 'validateDeps'> & {
  name?: TPath;
  [key: string]: any;
};

type FieldProps<
  TValues extends Record<string, any> = any,
  TPath extends AnyPath<TValues> = AnyPath<TValues>
> = UseFieldOptions<TValues, TPath> & {
  as?: React.ComponentType<any>;
  asProps?: Record<string, any>;
  valueToProps?: (value: any) => Record<string, any>;
  /** Error renderer: renders `<span id role="alert">` beside the input;
   * `aria-describedby` always points at that id (`fieldErrorId`). */
  renderError?: (error: string, id: string) => React.ReactNode;
};

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

/** Shared aria wiring: `aria-invalid` on error, `aria-describedby` pointed
 * at the error-message id (`fieldErrorId`); user ids survive ahead. */
function ariaProps(
  error: string | undefined,
  fieldKey: string,
  props: Record<string, any>
) {
  return {
    'aria-invalid': error ? true : props['aria-invalid'],
    'aria-describedby': error
      ? [props['aria-describedby'], errorIdFromKey(fieldKey)]
          .filter(Boolean)
          .join(' ')
      : props['aria-describedby']
  };
}

/** Declarative rules → native constraint attributes for browser/AT hints
 * (`required`, `minLength`, `pattern`, …). `undefined` when no rules. */
function toConstraintAttrs(
  rules: FieldRules | undefined
): Record<string, any> | undefined {
  return rules ? rulesToConstraintAttrs(rules) : undefined;
}

/** Callable shape of {@link Field}; a named interface because the inline
 * `as <TValues,...>() => ...` form trips no-use-before-define. */
type FieldComponent = {
  <
    TValues extends Record<string, any> = any,
    TPath extends AnyPath<TValues> = AnyPath<TValues>
  >(
    props: FieldProps<TValues, TPath> & React.RefAttributes<HTMLInputElement>
  ): React.ReactElement | null;
};

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
      validateOnMount,
      valueAsNumber,
      valueAsDate,
      asyncAlways,
      disabled,
      delayError,
      mode,
      uncontrolled,
      ...props
    },
    ref
  ) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const [nativeInvalidCount, setNativeInvalidCount] = React.useState(0);
    // Raw useContext (not useFormContext) so a form-prop-only call site
    // with no provider still works.
    const contextForm = React.useContext(FormContext);
    const resolvedForm = formProp ?? contextForm;
    const isFile = props.type === 'file';
    // The native gate calls validate as a function, so wrap a Standard Schema here.
    const validateWrapped =
      validate && hasStandardProps(validate)
        ? schemaToFieldValidator(validate as StandardSchemaV1<any, any>)
        : (validate as ((value: any, meta: any) => any) | undefined);
    // Declared options go to the hook; `as`/`valueToProps`/DOM props stay
    // in `props` (useField no longer echoes unknown options).
    const {
      value,
      onChange,
      onBlur,
      error,
      name: fieldKey,
      disabled: isDisabled,
      focusRef,
      validating
    } = useField({
      name: name!,
      form: formProp,
      initialValue,
      shouldUnregister,
      rules,
      validateDebounce,
      validateOnMount,
      delayError,
      disabled,
      asyncAlways,
      mode,
      // File inputs can't be value-controlled — force the uncontrolled path.
      uncontrolled: uncontrolled || isFile,
      validate: (...params: [any, any]) => {
        // Per-kick native gate: a control failing its own constraints skips
        // the custom validator (RHF first-error); shouldUseNativeValidation:
        // false disables it.
        if (resolvedForm?.shouldUseNativeValidation !== false) {
          const el = innerRef.current;
          if (el && typeof el.checkValidity === 'function') {
            el.setCustomValidity('');
            if (el.checkValidity() === false) {
              setNativeInvalidCount(count => count + 1);
              return undefined;
            }
          }
        }
        if (validateWrapped) return validateWrapped(...params);
      }
    });
    // Merged ref: innerRef (native gate), focusRef (setFocus/shouldFocusError),
    // and the forwarded ref.
    const mergedRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        focusRef(node);
        setRef(ref, node);
      },
      [ref, focusRef]
    );

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

    if (__DEV__ && valueAsNumber && valueAsDate) {
      // eslint-disable-next-line no-console -- dev-only diagnostics
      console.warn(
        'react-f0rm: valueAsNumber and valueAsDate are mutually exclusive — ' +
          'valueAsNumber wins. Use eventToValue for anything else.'
      );
    }
    const Component = as || 'input';
    const toValue = eventToValueOrDefault(eventToValue, {
      valueAsNumber,
      valueAsDate
    });

    // File inputs never receive a value/defaultValue prop (they cannot
    // be value-controlled); uncontrolled renders defaultValue, controlled
    // renders value.
    const valueProps = valueToProps
      ? valueToProps(value)
      : isFile
        ? {}
        : uncontrolled
          ? {defaultValue: value}
          : {value};

    // fieldKey is the JSON-stringified path key, e.g. '["a","0"]'.
    const errorId = errorIdFromKey(fieldKey);
    // Spread constraint attrs before `props` so a user-passed required/pattern
    // wins; the store still owns error messages (renderError/aria-invalid).
    const constraintAttrs = toConstraintAttrs(rules);

    return (
      <>
        <Component
          {...constraintAttrs}
          {...props}
          name={fieldKey}
          onBlur={onBlur}
          {...asProps}
          {...valueProps}
          {...ariaProps(error, fieldKey, props)}
          disabled={isDisabled}
          aria-busy={validating || undefined}
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

/** Callable shape of {@link Checkbox}: same form-typed `validate` contract
 * as {@link FieldComponent}. */
type CheckboxComponent = {
  <
    TValues extends Record<string, any> = any,
    TPath extends AnyPath<TValues> = AnyPath<TValues>
  >(
    props: UseFieldOptions<TValues, TPath> &
      React.RefAttributes<HTMLInputElement>
  ): React.ReactElement | null;
};

export const Checkbox = React.forwardRef<HTMLInputElement, UseFieldOptions>(
  (
    {
      name,
      form,
      initialValue,
      shouldUnregister,
      validate,
      rules,
      validateDebounce,
      validateOnMount,
      asyncAlways,
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
      disabled: isDisabled,
      validating
    } = useField({
      name: name!,
      form,
      initialValue,
      shouldUnregister,
      validate,
      rules,
      validateDebounce,
      validateOnMount,
      asyncAlways,
      delayError,
      disabled,
      mode
    });
    const constraintAttrs = toConstraintAttrs(rules);
    return (
      <input
        {...constraintAttrs}
        {...props}
        name={fieldKey}
        onBlur={onBlur}
        type="checkbox"
        checked={!!value}
        {...ariaProps(error, fieldKey, props)}
        disabled={isDisabled}
        aria-busy={validating || undefined}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.checked)
        }
        ref={ref}
      />
    );
  }
) as CheckboxComponent;

type SelectProps<
  TValues extends Record<string, any> = any,
  TPath extends AnyPath<TValues> = AnyPath<TValues>
> = UseFieldOptions<TValues, TPath> & {
  multiple?: boolean;
  children?: React.ReactNode;
};

/** Select value coercion: single → string, multiple → string[]. */
function toSelectValue(
  multiple: boolean | undefined,
  value: any
): string | string[] {
  if (multiple) return Array.isArray(value) ? value : [];
  return value ?? '';
}

/** Callable shape of {@link Select}: same form-typed `validate` contract
 * as {@link FieldComponent}. */
type SelectComponent = {
  <
    TValues extends Record<string, any> = any,
    TPath extends AnyPath<TValues> = AnyPath<TValues>
  >(
    props: SelectProps<TValues, TPath> & React.RefAttributes<HTMLSelectElement>
  ): React.ReactElement | null;
};

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
      validateOnMount,
      asyncAlways,
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
      disabled: isDisabled,
      validating
    } = useField({
      name: name!,
      form,
      initialValue,
      shouldUnregister,
      validate,
      rules,
      validateDebounce,
      validateOnMount,
      asyncAlways,
      delayError,
      disabled,
      mode
    });
    const constraintAttrs = toConstraintAttrs(rules);
    return (
      <select
        {...constraintAttrs}
        {...props}
        name={fieldKey}
        onBlur={onBlur}
        multiple={multiple}
        value={toSelectValue(multiple, value)}
        {...ariaProps(error, fieldKey, props)}
        disabled={isDisabled}
        aria-busy={validating || undefined}
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
