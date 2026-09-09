import * as React from 'react';
import {handleSubmit, setDisabled} from '../form';
// 别名规避 rollup-plugin-dts 对「type import 与本地 default export 同名」
// 的 Identifier already declared 报错。
import type {ActionErrorResult} from '../core/submit';
import type {Form as FormApi} from '../form';
import {formDataFromValues} from '../server';
import {FormContext} from '../context';
import useForm from '../hooks/form';

/**
 * Props for <Form>.
 *
 * Native validation behavior: the rendered <form> always sets noValidate,
 * which suppresses the browser's built-in blocked-submit UI. However, native
 * constraint validation still gates submission — the form element's
 * checkValidity() runs before custom validators, and when it fails,
 * reportValidity() surfaces the offending constraints as native bubbles and
 * submission stops (onInvalidSubmit fires). onSubmit/onValidSubmit only run
 * once every native constraint (required, type=email, minLength, ...) passes.
 *
 * The submit flow itself lives in the headless `handleSubmit` (see form.ts);
 * this component is a thin wrapper that binds it to the rendered <form>.
 */
type FormProps<T extends Record<string, any> = any> = Omit<
  React.FormHTMLAttributes<HTMLFormElement>,
  'onSubmit'
> & {
  form?: FormApi<T>;
  /**
   * Provide into an isolated context from `createFormContext()` instead of
   * the module-level one — `<Form context={ProfileForm.context}>` keeps the
   * component's full submit machinery while the factory's bound hooks
   * (`ProfileForm.useField`, `ProfileForm.useFormContext`, ...) resolve this
   * form from their private context. The module-level `useFormContext()` /
   * `useField` do not see it; that is the point of the isolation. Omitted,
   * the form lands in the module-level FormContext as before.
   */
  context?: React.Context<FormApi<any> | null>;
  /**
   * The values baseline — a sync object, a Promise, or a thunk returning
   * either ({@link Options.initialValues}). Async sources render the form
   * empty and gate on `form.isLoading` until they resolve.
   */
  initialValues?: T | Promise<T> | (() => T | Promise<T>);
  /**
   * Form-level default for a bound field's unmount behavior
   * ({@link Options.shouldUnregister}): `true` (the default) tombstones
   * unmounted fields, `false` keeps their values.
   */
  shouldUnregister?: boolean;
  /**
   * Validate on mount (see {@link Options.validateOnMount}): every
   * mounted field with a validator kicks once after mount and the
   * form-level `validate` (if any) runs once. A field's own
   * `validateOnMount` prop overrides this flag.
   */
  validateOnMount?: boolean;
  /**
   * Disable every bound field: the form-level flag fields OR with their
   * own `disabled` option (a field cannot opt out). Seeded at create and
   * kept in sync while this prop changes (undefined leaves the current
   * flag untouched — toggle at runtime with `setDisabled`).
   */
  disabled?: boolean;
  /**
   * Form-level default for field validation's `asyncAlways`: a field
   * whose `required` gate failed still runs its debounced validator, its
   * result landing per-source alongside the gate's errors. A field's own
   * `asyncAlways` prop overrides this flag.
   */
  asyncAlways?: boolean;
  /**
   * Controlled external values. When the `values` reference changes, the
   * new object is synced into the form (via setInitialValues semantics):
   * uncommitted user edits are discarded -- master-detail semantics, where
   * selecting another record replaces the draft -- while touched flags and
   * errors are kept. Sync is reference-based: re-renders that pass the same
   * `values` reference never clobber what the user is typing.
   */
  values?: T;
  /** May be async — the submit flow awaits it, so form.isSubmitting
   * covers the entire flight. */
  onSubmit?: (values: T, e: React.FormEvent) => void | Promise<void>;
  /** May be async, same as onSubmit. */
  onValidSubmit?: (values: T, e: React.FormEvent) => void | Promise<void>;
  /**
   * React 19 Server Action target: after validation passes (and after
   * onSubmit/onValidSubmit), the validated, schema-coerced values are
   * converted to FormData ({@link formDataFromValues} — files, arrays and
   * nested objects included) and dispatched to this callback, e.g.
   * `action={createUser}` for a server action or
   * `action={formData => startTransition(() => dispatch(formData))}` in a
   * useActionState bridge. `isSubmitting` covers the whole flight.
   *
   * The callback may return an {@link ActionErrorResult}: its `errors`
   * record lands on the form as per-field `type: 'server'` errors and the
   * submit counts as unsuccessful — a server action rejecting the payload
   * (422-style) hydrates the fields exactly like failed client
   * validation. Return anything else to report success.
   *
   * Alternatively pass a URL string: it renders as the form's native
   * `action` attribute, giving progressive enhancement — without
   * JavaScript the browser posts the raw FormData to it (native
   * constraint attributes from declarative `rules` still gate invalid
   * submits), and with JavaScript the validated pipeline runs instead
   * (pair the URL with `method="post"` and perform the network call in
   * `onValidSubmit`; `handleSubmit` preventDefaults the native post).
   */
  action?:
    string | ((formData: FormData) => void | Promise<void | ActionErrorResult>);
  /**
   * Called when validation fails.
   * @param errors array of {path, type, message} entries in insertion
   *        order; path is the dotted field path ('a.b', 'list.0'), type is
   *        the error kind ('custom' for plain string errors, 'native' for
   *        failed DOM constraint validation), message is the display text
   * @param values current form values
   */
  onInvalidSubmit?: (
    errors: {path: string; type: string; message: string}[],
    values: T
  ) => void;
  /**
   * Focus the first field with an error after a failed submit: custom
   * validation failures focus the first errored field, native constraint
   * failures focus the first ':invalid' control. Defaults to true; pass
   * false to disable.
   */
  shouldFocusError?: boolean;
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
  ...props
}: FormProps<T>) {
  const f2 = useForm<T>({
    initialValues,
    values,
    shouldUnregister,
    validateOnMount,
    disabled,
    asyncAlways
  });
  const form = f1 || f2;

  // The form instance outlives prop changes (useForm creates it once), so
  // a changing `disabled` prop re-applies through the runtime channel —
  // the same `setDisabled` consumers toggle imperatively. undefined means
  // "not controlled here": leave the flag as-is.
  React.useEffect(() => {
    if (disabled !== undefined) setDisabled(form, disabled);
  }, [form, disabled]);

  const submit = handleSubmit(form, {
    onSubmit,
    onValidSubmit,
    onInvalidSubmit,
    shouldFocusError,
    onAction:
      typeof action === 'function'
        ? values => action(formDataFromValues(values))
        : undefined
  });

  // Route the form into the caller's isolated context (createFormContext)
  // or the module-level default, whichever Provider we ended up with.
  const {Provider} = context ?? FormContext;

  // A string `action` is the progressive-enhancement URL: rendered as the
  // native attribute so a no-JS submit posts raw FormData to it, while
  // the JS path (handleSubmit) preventDefaults and runs the validated
  // pipeline instead.
  const nativeAction = typeof action === 'string' ? action : undefined;

  return (
    <Provider value={form}>
      <form {...props} action={nativeAction} noValidate onSubmit={submit} />
    </Provider>
  );
}
