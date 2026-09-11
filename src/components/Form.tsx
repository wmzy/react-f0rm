import * as React from 'react';
import {handleSubmit, setDisabled} from '../form';
// 别名规避 rollup-plugin-dts 对「type import 与本地 default export 同名」
// 的 Identifier already declared 报错。
import type {ActionErrorResult} from '../core/submit';
import type {Form as FormApi} from '../form';
import {formDataFromValues} from '../server';
import {FormContext} from '../context';
import useForm from '../hooks/form';

/** Props for <Form>. Native constraint validation gates submission: the
 * form always sets noValidate, but checkValidity() runs before custom
 * validators and a failure stops submission (onInvalidSubmit fires).
 * `shouldUseNativeValidation={false}` skips the gate (targets without
 * checkValidity are always exempt). The flow itself lives in the headless
 * `handleSubmit`; this is a thin wrapper binding it to the <form>. */
type FormProps<T extends Record<string, any> = any> = Omit<
  React.FormHTMLAttributes<HTMLFormElement>,
  'onSubmit'
> & {
  form?: FormApi<T>;
  /** Isolated context from `createFormContext()`: its bound hooks see this
   * form, the module-level ones do not. Defaults to FormContext. */
  context?: React.Context<FormApi<any> | null>;
  /** Values baseline — sync object, Promise, or thunk; async sources gate on `isLoading`. */
  initialValues?: T | Promise<T> | (() => T | Promise<T>);
  /** Default unmount behavior: `true` tombstones unmounted fields, `false` keeps values. */
  shouldUnregister?: boolean;
  /** Validate on mount: each validator kicks once; a field's own prop overrides. */
  validateOnMount?: boolean;
  /** Disable every bound field (fields OR with their own option); undefined leaves the flag untouched. */
  disabled?: boolean;
  /** Form-level default for `asyncAlways`; a field's own prop overrides. */
  asyncAlways?: boolean;
  /** Controlled external values: a new reference syncs via setInitialValues
   * (draft discarded, touched/errors kept); same reference never clobbers. */
  values?: T;
  /** May be async; `isSubmitting` covers the flight. */
  onSubmit?: (values: T, e: React.FormEvent) => void | Promise<void>;
  /** May be async, same as onSubmit. */
  onValidSubmit?: (values: T, e: React.FormEvent) => void | Promise<void>;
  /** Server Action target: after validation, schema-coerced values become
   * FormData and dispatch here. Returning {@link ActionErrorResult} lands
   * `type: 'server'` per-field errors (unsuccessful submit); a URL string
   * renders the native `action` for no-JS progressive enhancement. */
  action?:
    string | ((formData: FormData) => void | Promise<void | ActionErrorResult>);
  /** Called when validation fails; errors are {path, type, message} entries
   * (type: 'custom' | 'native'). */
  onInvalidSubmit?: (
    errors: {path: string; type: string; message: string}[],
    values: T
  ) => void;
  /** Focus the first errored field (or first ':invalid' control) after a failed submit. Default true. */
  shouldFocusError?: boolean;
  /** Whether native constraint validation gates submission (pass false for
   * custom-validator-only forms). Seeds the created form's flag and this
   * form's submit wiring. */
  shouldUseNativeValidation?: boolean;
};

export default function Form<T extends Record<string, any> = any>({
  form: f1,
  context,
  initialValues,
  values,
  shouldUnregister,
  validateOnMount,
  disabled,
  asyncAlways,
  onSubmit,
  onValidSubmit,
  onInvalidSubmit,
  action,
  shouldFocusError,
  shouldUseNativeValidation,
  ...props
}: FormProps<T>): React.JSX.Element {
  const f2 = useForm<T>({
    initialValues,
    values,
    shouldUnregister,
    validateOnMount,
    disabled,
    asyncAlways,
    shouldUseNativeValidation
  });
  const form = f1 || f2;

  // The form outlives prop changes; a changing `disabled` re-applies via
  // setDisabled. undefined = not controlled here.
  React.useEffect(() => {
    if (disabled !== undefined) setDisabled(form, disabled);
  }, [form, disabled]);

  const submit = handleSubmit(form, {
    onSubmit,
    onValidSubmit,
    onInvalidSubmit,
    shouldFocusError,
    shouldUseNativeValidation,
    onAction:
      typeof action === 'function'
        ? values => action(formDataFromValues(values))
        : undefined
  });

  // Route the form into the isolated or module-level context.
  const {Provider} = context ?? FormContext;

  // String action → native attribute for no-JS progressive enhancement.
  const nativeAction = typeof action === 'string' ? action : undefined;

  return (
    <Provider value={form}>
      <form {...props} action={nativeAction} noValidate onSubmit={submit} />
    </Provider>
  );
}
