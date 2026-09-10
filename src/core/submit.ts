import {emit} from '../emitter';
import type {FieldErrorEntry, Form} from '../form';
import {getErrors, setServerErrors, clearServerErrors} from './errors';
import {getValues} from './values';
import {validate} from './validate';

export function setIsSubmitting(form: Form, value: boolean): void {
  form.isSubmitting = value;
  emit(form.emitter, 'submitting');
}

export function incrementSubmitCount(form: Form): void {
  form.submitCount++;
  emit(form.emitter, 'submitCount');
}

export function setSubmitSuccessful(form: Form, value: boolean): void {
  form.isSubmitSuccessful = value;
  emit(form.emitter, 'submitSuccessful');
}

/**
 * Set the form-level disabled flag and emit a payload-less 'disabled'
 * event — subscribed fields (useField and the components built on it)
 * re-render with the merged disabled state: form flag || their own
 * `disabled` option.
 * @param form
 * @param value
 */
export function setDisabled(form: Form, value: boolean): void {
  form.disabled = value;
  emit(form.emitter, 'disabled');
}

/**
 * Set the form's user-owned metadata slot (Formik's `status` role): the
 * payload-less 'status' event wakes {@link useStatus} and any imperative
 * `subscribe(form, {event: 'status'})` listeners. Nothing else reads or
 * interprets the value — server session flags, step state, non-field
 * errors of any shape are all fair game. Starts `undefined`.
 * @param form
 * @param value
 */
export function setStatus(form: Form, value: any): void {
  form.status = value;
  emit(form.emitter, 'status');
}

/** Structural slice of a <form>-like element: an elements collection whose
 * controls expose the constraint-validation members we read. Matches the
 * DOM HTMLFormElement shape without coupling the core to DOM types. */
type NativeFormElement = {
  elements: ArrayLike<{
    name: string;
    checkValidity: () => boolean;
    validationMessage: string;
  }>;
};

/**
 * Converts a control's DOM name to the user-visible dotted path. Field
 * components render the path key (JSON.stringify'd segments, '["a","0"]')
 * as the name attribute, so JSON keys are parsed back and joined with
 * dots; any other name value is returned as-is.
 */
function nameToPath(name: string): string {
  if (name.startsWith('[')) {
    try {
      const segments = JSON.parse(name);
      if (Array.isArray(segments)) return segments.join('.');
    } catch {
      // Not a JSON path key — fall through and use the raw name.
    }
  }
  return name;
}

/**
 * Collects the constraints failing native validation on a <form> as
 * {@link FieldErrorEntry} entries, in DOM order.
 *
 * Design note: native errors are deliberately NOT written into the form's
 * errors Map. That Map tracks custom validator state, while native
 * validity is transient DOM state owned by the browser (surfaced through
 * reportValidity); onInvalidSubmit receives this snapshot directly.
 */
function getNativeErrors(formEl: NativeFormElement): FieldErrorEntry[] {
  const errors: FieldErrorEntry[] = [];
  const {elements} = formEl;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (
      el.name &&
      typeof el.checkValidity === 'function' &&
      !el.checkValidity()
    ) {
      errors.push({
        path: nameToPath(el.name),
        type: 'native',
        message: el.validationMessage
      });
    }
  }
  return errors;
}

/** Submit callbacks for {@link handleSubmit}. All optional — a missing
 * callback is simply skipped, matching the <Form> component semantics. */
export type HandleSubmitOptions<T extends Record<string, any> = any> = {
  /** Called after validation passes, before onValidSubmit. */
  onSubmit?: (values: T, e?: any) => void | Promise<void>;
  /** Called after validation passes, following a successful onSubmit. */
  onValidSubmit?: (values: T, e?: any) => void | Promise<void>;
  /**
   * Called when validation fails.
   * @param errors array of {path, type, message} entries in insertion
   *        order; path is the dotted field path ('a.b', 'list.0'), type is
   *        the error kind ('custom' for plain string errors, 'native' for
   *        failed DOM constraint validation), message is the display text
   * @param values current form values
   */
  onInvalidSubmit?: (errors: FieldErrorEntry[], values: T) => void;
  /**
   * Called after validation passes and the submit callbacks ran, with the
   * final (schema-coerced) values — the slot <Form>'s `action` prop uses
   * to dispatch React 19 server actions with FormData. Runs inside the
   * same isSubmitting window and is awaited like onSubmit/onValidSubmit.
   *
   * The callback may return an {@link ActionErrorResult}: its `errors`
   * record (field path → message or messages) lands on the form through
   * {@link setServerErrors} (`type: 'server'`, cleared existing server
   * errors replaced), and the submit counts as unsuccessful — a rejected
   * server round trip is an invalid submit, exactly like failed client
   * validation. Any other return value (including `undefined`) means the
   * submit succeeded.
   */
  onAction?: (values: T, e?: any) => void | Promise<void | ActionErrorResult>;
  /**
   * Focus the first error field after a failed submit. Defaults to true —
   * only an explicit `false` disables it. When custom validation fails,
   * a 'focusError' event carrying the first error's path key is emitted
   * on the form (bound fields such as <Field> subscribe and focus their
   * input); when native constraint validation fails, the submitted
   * form's first ':invalid' control is focused directly.
   */
  shouldFocusError?: boolean;
  /**
   * Whether native constraint validation (the submitted element's
   * checkValidity) gates this attempt. Defaults to the form's
   * {@link Form.shouldUseNativeValidation} flag — pass `false` to skip
   * the native gate for one submit (a save-draft button, say) while
   * custom validators still run; pass `true` to reinstate it on a form
   * that disabled it. Targets without checkValidity never gate.
   */
  shouldUseNativeValidation?: boolean;
};

/** What a server action / onAction callback returns when the server
 * rejected the payload: a field-path → message(s) record, landed on the
 * form as `type: 'server'` errors. Undefined (or anything else) means
 * success. */
export type ActionErrorResult = {
  errors?: Record<string, string | string[]>;
};

/**
 * Create an async submit handler for `form` — the headless counterpart of
 * the <Form> component's onSubmit wiring.
 *
 * Behavior mirrors <Form> exactly: preventDefault when present, then the
 * submit state machine (isSubmitting/submitCount/isSubmitSuccessful) runs
 * around native constraint validation (via `e.currentTarget.checkValidity`,
 * skipped when the target has no checkValidity — e.g. React Native or
 * toolbar-button submits) and custom validators. Failed validation fires
 * onInvalidSubmit with the flattened error entries; a passing submit runs
 * onSubmit then onValidSubmit. Errors thrown by either are swallowed into
 * isSubmitSuccessful=false rather than rejecting the returned promise.
 * Failed validation also focuses the offending field (see
 * {@link HandleSubmitOptions.shouldFocusError}).
 *
 * @param form form instance
 * @param options submit callbacks
 * @return async event handler, callable without an event object
 */
export function handleSubmit<T extends Record<string, any> = any>(
  form: Form<T>,
  options?: HandleSubmitOptions<T>
): (e?: {preventDefault?: () => void; currentTarget?: any}) => Promise<void> {
  const {
    onSubmit,
    onValidSubmit,
    onInvalidSubmit,
    onAction,
    shouldFocusError = true,
    shouldUseNativeValidation = form.shouldUseNativeValidation
  } = options ?? {};
  return async e => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const formEl = e?.currentTarget;
    // A fresh attempt supersedes the previous round trip's verdict:
    // server errors from the last submit must not veto this one (the
    // server is being asked again). Client errors stay — they describe
    // the current form state, not a stale response.
    clearServerErrors(form);
    // Land the submitted flag before the isSubmitting flip: the single
    // 'submitting' emit setIsSubmitting fires carries both state changes
    // to FormState subscribers.
    form.isSubmitted = true;
    setIsSubmitting(form, true);
    incrementSubmitCount(form);
    const values = getValues(form);

    if (
      shouldUseNativeValidation &&
      formEl &&
      typeof formEl.checkValidity === 'function' &&
      formEl.checkValidity() === false
    ) {
      formEl.reportValidity();
      // Focus the first natively-invalid control directly off the DOM;
      // native failures never enter the errors Map (see below).
      if (shouldFocusError && typeof formEl.querySelector === 'function') {
        const invalid = formEl.querySelector(':invalid') as HTMLElement | null;
        if (invalid && typeof invalid.focus === 'function') invalid.focus();
      }
      setIsSubmitting(form, false);
      setSubmitSuccessful(form, false);
      // Native constraint failures are read from the DOM (not the errors
      // Map, which only holds custom validation state — see getNativeErrors).
      if (onInvalidSubmit) onInvalidSubmit(getNativeErrors(formEl), values);
      return;
    }

    const error = await validate(form);

    if (error) {
      setIsSubmitting(form, false);
      setSubmitSuccessful(form, false);
      // Notify bound fields (e.g. <Field>) so the first errored one can
      // focus its input; the payload is the errors Map's first key.
      if (shouldFocusError) {
        const firstKey = form.errors.keys().next().value;
        if (firstKey !== undefined) emit(form.emitter, 'focusError', firstKey);
      }
      if (onInvalidSubmit) onInvalidSubmit(getErrors(form), values);
      return;
    }

    try {
      // Re-read after validation: a schema validator's parsed output
      // (ValidationOutcome.values) landed in parsedValues during
      // validate(), and the submit callbacks must see the coerced /
      // transformed values, not the raw pre-validation snapshot.
      const submitted = getValues(form);
      if (onSubmit) await onSubmit(submitted, e);
      if (onValidSubmit) await onValidSubmit(submitted, e);
      if (onAction) {
        const result = await onAction(submitted, e);
        // A server round trip that returns errors is an invalid submit:
        // land them as per-field 'server' errors and mark the attempt
        // unsuccessful (Conform's server-error hydration, RHF's
        // setError-after-submit pattern — both folded into one contract).
        if (
          result &&
          typeof result === 'object' &&
          result.errors !== undefined &&
          typeof result.errors === 'object'
        ) {
          setServerErrors(form, result.errors);
          setSubmitSuccessful(form, false);
          return;
        }
      }
      setSubmitSuccessful(form, true);
    } catch {
      setSubmitSuccessful(form, false);
    } finally {
      setIsSubmitting(form, false);
    }
  };
}
