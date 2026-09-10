import * as React from 'react';
import useField from '../hooks/field';
import {FormContext} from '../context';
import type {Validator} from '../hooks/validate';
import type {Form, ValidationMode} from '../form';
import {rulesToConstraintAttrs} from '../rules';
import type {FieldRules} from '../rules';
import type {Name, Path, PathSegments} from '../path';
import createPath from '../path';
import type {StandardSchemaV1} from '../standardSchema';
import {hasStandardProps, schemaToFieldValidator} from '../standardSchema';
import type {FieldPath, PathValueOf} from '../types';

/** Dev-only flag, replaced at build time (rollup.config.js `replace`);
 * defined for the test environment in vitest.config.ts. */
declare const __DEV__: boolean;

/**
 * Props shared by Field/Checkbox/Select. Generic so a typed form flows into
 * the `validate` callback: with `form` (a `Form<Values>`) and `name`
 * (a `FieldPath<Values>`) provided, `validate` receives the value at that
 * path — `PathValueOf<Values, P>` — instead of `any`. The defaults keep the
 * bare `<Field name="x" />` (context-resolved, untyped) call sites exactly
 * as permissive as before.
 */
type UseFieldOptions<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments
> = {
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
  validate?:
    | ((
        value: PathValueOf<TValues, TPath>,
        meta: {form: Form; path: Path; signal: AbortSignal}
      ) => ReturnType<Validator>)
    | StandardSchemaV1<PathValueOf<TValues, TPath>>;
  /**
   * Declarative rules (required/min/max/minLength/maxLength/pattern,
   * plus custom `validate` callbacks), compiled into a validator that
   * runs before `validate`; failures land in the form's error state.
   * The declarative subset is also rendered as native constraint
   * attributes (`required`, `minLength`, `pattern`, …) onto the element
   * for browser/AT hints — `:invalid` styling, screen-reader
   * announcements — while the store pipeline stays the source of truth
   * for messages (`renderError`/`aria-invalid` keep working; a user-passed
   * `required`/`pattern`/… prop overrides the derived attribute). Passed
   * through to useField — like validateDebounce it is never spread onto
   * the DOM element.
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
   * Run this field's debounced validator even when its `required` gate
   * failed (TanStack Form's `asyncAlways`): the gate's errors land
   * immediately, the validator's own result lands alongside them
   * per-source. Falls back to the form-level `createForm({asyncAlways})`.
   * Passed through to useField.
   */
  asyncAlways?: boolean;
  /**
   * Validate this field once on mount (see {@link
   * UseFieldOptions}' `validateOnMount`): overrides the form-level
   * `createForm({validateOnMount})` / `<Form validateOnMount>` flag in
   * either direction. Passed through to useField.
   */
  validateOnMount?: boolean;
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
  /**
   * Uncontrolled mode: render the element with `defaultValue` instead of
   * `value` — typing re-renders nothing (the store still carries every
   * write; errors/touched/disabled still re-render the field). The
   * snapshot is pinned at mount; bulk operations (reset/setInitialValues)
   * sync the DOM element directly without a render — RHF-register
   * behavior (read live values with useValue/getValues). Passed through
   * to useField, never spread onto the DOM element.
   */
  uncontrolled?: boolean;
  [key: string]: any;
};

type FieldProps<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments
> = UseFieldOptions<TValues, TPath> & {
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
  /**
   * Store `e.target.valueAsNumber` instead of the string value —
   * react-hook-form's `register({valueAsNumber})` counterpart for number
   * inputs (`<input type="number">`). `NaN` passes through as-is when the
   * input cannot be parsed, matching RHF. An explicit `eventToValue`
   * takes precedence.
   */
  valueAsNumber?: boolean;
  /**
   * Store `e.target.valueAsDate` instead of the string value — RHF's
   * `register({valueAsDate})` counterpart for date/time inputs. `null`
   * passes through when the input cannot be parsed. An explicit
   * `eventToValue` takes precedence; combining with `valueAsNumber` is a
   * TypeError.
   */
  valueAsDate?: boolean;
};

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
 * The aria wiring every bound field shares: `aria-invalid` when the field
 * has an error, and `aria-describedby` pointing at the error-message
 * element id derived from the field key — the same id `fieldErrorId(name)`
 * derives (the key is what useField returns as `name`). User-provided ids
 * survive, joined ahead of the error id.
 */
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
type FieldComponent = {
  <
    TValues extends Record<string, any> = any,
    TPath extends FieldPath<TValues> | PathSegments =
      FieldPath<TValues> | PathSegments
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
    // The native gate below reads the form's shouldUseNativeValidation
    // flag; raw useContext (not useFormContext) so a form-prop-only call
    // site — no provider mounted — still works. Null only while useField
    // is about to throw anyway.
    const contextForm = React.useContext(FormContext);
    const resolvedForm = formProp ?? contextForm;
    // A Standard Schema passed straight to `validate` becomes a validator
    // here: the checkValidity gate below calls it as a function, which a
    // schema object is not (useField applies the same wrap further down).
    const validateOption = validate;
    const validateWrapped =
      validateOption && hasStandardProps(validateOption)
        ? schemaToFieldValidator(validateOption as StandardSchemaV1<any, any>)
        : (validateOption as ((value: any, meta: any) => any) | undefined);
    // Only declared options go into the hook; DOM props stay in `props` and
    // are spread onto the element below — useField no longer echoes unknown
    // options back, so `as`/`valueToProps`/DOM props are destructured here
    // instead of being fished out of its result.
    const {
      value,
      onChange,
      onBlur,
      error,
      name: fieldKey,
      disabled: isDisabled,
      focusRef
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
      // File inputs cannot be value-controlled at all — force the
      // uncontrolled path so no `value` prop ever reaches the element.
      uncontrolled: uncontrolled || props.type === 'file',
      validate: (...params: [any, any]) => {
        // The per-kick native gate: a control failing its own constraints
        // skips the custom validator for this kick (RHF first-error
        // semantics). `createForm({shouldUseNativeValidation: false})`
        // disables it — custom validators become the only verdict.
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
        // The gate below calls the validator as a function — a Standard
        // Schema object must become a validator first (useField wraps it
        // too; this wrapper sits outside that pipeline).
        if (validateWrapped) return validateWrapped(...params);
      }
    });
    // One merged ref, three duties: the private innerRef (validate's
    // setCustomValidity above), the focus channel (useField's focusRef —
    // setFocus and a failed submit's shouldFocusError focus through it),
    // and the user's forwarded ref. focusRef is identity-stable, so the
    // deps behave exactly as the previous [ref] did.
    const mergedRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        focusRef(node);
        setRef(ref, node);
      },
      [ref, focusRef]
    );
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

    const isFile = props.type === 'file';
    if (__DEV__ && valueAsNumber && valueAsDate) {
      // eslint-disable-next-line no-console -- dev-only diagnostics
      console.warn(
        'react-f0rm: valueAsNumber and valueAsDate are mutually exclusive — ' +
          'valueAsNumber wins. Use eventToValue for anything else.'
      );
    }
    const toValue =
      eventToValue ??
      (isFile
        ? (e: any) => e.target.files
        : valueAsNumber
          ? (e: any) => e.target.valueAsNumber
          : valueAsDate
            ? (e: any) => e.target.valueAsDate
            : (e: any) => e.target.value);

    // file inputs never receive a value/defaultValue prop (they cannot be
    // value-controlled); uncontrolled renders defaultValue, controlled
    // renders value.
    const valueProps = valueToProps
      ? valueToProps(value)
      : isFile
        ? {}
        : uncontrolled
          ? {defaultValue: value}
          : {value};

    // fieldKey is the field's path key (set by useField), e.g. '["a","0"]'.
    const errorId = errorIdFromKey(fieldKey);
    // Declarative rules → native constraint attributes for browser/AT
    // hints (:invalid styling, screen-reader announcements). Spread
    // before `props` so a user-passed required/minLength/pattern always
    // wins over the derived one. The store pipeline keeps owning
    // messages: rules run ahead of the wrapper below, so their errors
    // land in the form state (renderError/aria-invalid) even when the
    // native checkValidity gate now also sees the derived attrs and
    // skips the user's `validate` for that kick (RHF first-error
    // semantics).
    const constraintAttrs = rules ? rulesToConstraintAttrs(rules) : undefined;

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

type CheckboxProps<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments
> = UseFieldOptions<TValues, TPath>;

/**
 * Callable shape of {@link Checkbox}: the same form-typed `validate`
 * inference contract as {@link FieldComponent}.
 */
type CheckboxComponent = {
  <
    TValues extends Record<string, any> = any,
    TPath extends FieldPath<TValues> | PathSegments =
      FieldPath<TValues> | PathSegments
  >(
    props: CheckboxProps<TValues, TPath> & React.RefAttributes<HTMLInputElement>
  ): React.ReactElement | null;
};

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
      disabled: isDisabled
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
    // Same error-id convention as Field: the checkbox describes the
    // fieldErrorId(name) element whenever it has an error.
    const constraintAttrs = rules ? rulesToConstraintAttrs(rules) : undefined;
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
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments
> = UseFieldOptions<TValues, TPath> & {
  multiple?: boolean;
  children?: React.ReactNode;
};

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
type SelectComponent = {
  <
    TValues extends Record<string, any> = any,
    TPath extends FieldPath<TValues> | PathSegments =
      FieldPath<TValues> | PathSegments
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
      disabled: isDisabled
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
    // Same error-id convention as Field: the select describes the
    // fieldErrorId(name) element whenever it has an error.
    const constraintAttrs = rules ? rulesToConstraintAttrs(rules) : undefined;
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
