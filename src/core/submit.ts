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

/** Set the form-level disabled flag and emit a payload-less 'disabled'
 * event — subscribed fields re-render with the merged state (form flag ||
 * their own `disabled` option). */
export function setDisabled(form: Form, value: boolean): void {
  form.disabled = value;
  emit(form.emitter, 'disabled');
}

/** Set the form's user-owned metadata slot (Formik's `status` role): the
 * payload-less 'status' event wakes {@link useStatus} and imperative
 * `subscribe` listeners. Nothing else interprets the value. */
export function setStatus(form: Form, value: any): void {
  form.status = value;
  emit(form.emitter, 'status');
}

/** Structural slice of a <form>-like element: controls exposing the
 * constraint-validation members we read, without coupling core to DOM
 * types. */
type NativeFormElement = {
  elements: Iterable<{
    name: string;
    checkValidity: () => boolean;
    validationMessage: string;
  }>;
};

/** Converts a control's DOM name to the user-visible dotted path. Field
 * components render the path key (JSON segments, '["a","0"]') as the name
 * attribute, so JSON keys are parsed back and joined with dots; any other
 * name is returned as-is. */
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

/** Collect the constraints failing native validation on a <form> as
 * {@link FieldErrorEntry} entries, in DOM order. Native errors are NOT
 * written into the errors Map — it tracks custom validator state, while
 * native validity is transient browser-owned DOM state. */
function getNativeErrors(formEl: NativeFormElement): FieldErrorEntry[] {
  const errors: FieldErrorEntry[] = [];
  for (const el of formEl.elements) {
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

/** A submit callback: the submitted values plus the triggering event. */
type SubmitCallback<T> = (values: T, e?: any) => void | Promise<void>;

/** Submit callbacks for {@link handleSubmit}. All optional — a missing
 * callback is simply skipped, matching the <Form> component semantics. */
export type HandleSubmitOptions<T extends Record<string, any> = any> = {
  /** Called after validation passes, before onValidSubmit. */
  onSubmit?: SubmitCallback<T>;
  /** Called after validation passes, following a successful onSubmit. */
  onValidSubmit?: SubmitCallback<T>;
  /** Called when validation fails, with the flattened error entries and
   * current values. */
  onInvalidSubmit?: (errors: FieldErrorEntry[], values: T) => void;
  /** Called after validation passes with the final (schema-coerced)
   * values — the slot <Form>'s `action` prop uses to dispatch React 19
   * server actions. May return an {@link ActionErrorResult}: its `errors`
   * record lands as `type: 'server'` errors and the submit counts
   * unsuccessful; any other return means success. */
  onAction?: (values: T, e?: any) => void | Promise<void | ActionErrorResult>;
  /** Focus the first error field after a failed submit. Defaults to true. */
  shouldFocusError?: boolean;
  /** Whether native constraint validation gates this attempt. Defaults to
   * the form's {@link Form.shouldUseNativeValidation} flag. Targets
   * without checkValidity never gate. */
  shouldUseNativeValidation?: boolean;
};

/** What a server action / onAction callback returns when the server
 * rejected the payload: a field-path → message(s) record, landed as
 * `type: 'server'` errors. Undefined (or anything else) means success. */
export type ActionErrorResult = {
  errors?: Record<string, string | string[]>;
};

/** Create an async submit handler for `form` — the headless counterpart of
 * the <Form> component's onSubmit wiring. Runs the submit state machine
 * around native constraint validation (skipped for targets without
 * checkValidity) and custom validators; failed validation fires
 * onInvalidSubmit, a passing submit runs onSubmit then onValidSubmit.
 * Errors thrown by either are swallowed into isSubmitSuccessful=false.
 * A new attempt while one is in flight is ignored outright (no state
 * changes at all) — including handleSubmit calls nested inside onSubmit. */
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
    // One flight at a time: isSubmitting flips true synchronously before
    // the first await below, so any attempt arriving while a round is
    // pending — a double click, or handleSubmit nested inside onSubmit —
    // is ignored before touching any state. The settling finally resets
    // the flag and re-arms the next round.
    if (form.isSubmitting) return;
    // A fresh attempt supersedes the previous round trip's verdict: server
    // errors from the last submit must not veto this one (the server is
    // being asked again). Client errors stay.
    clearServerErrors(form);
    // Land the submitted flag before the isSubmitting flip: the single
    // 'submitting' emit carries both state changes to subscribers.
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
      // native failures never enter the errors Map (see getNativeErrors).
      if (shouldFocusError && typeof formEl.querySelector === 'function') {
        const invalid = formEl.querySelector(':invalid') as HTMLElement | null;
        if (invalid && typeof invalid.focus === 'function') invalid.focus();
      }
      setIsSubmitting(form, false);
      setSubmitSuccessful(form, false);
      // Native constraint failures are read from the DOM (not the errors
      // Map, which only holds custom validation state).
      if (onInvalidSubmit) onInvalidSubmit(getNativeErrors(formEl), values);
      return;
    }

    const error = await validate(form);
    if (error) {
      setIsSubmitting(form, false);
      setSubmitSuccessful(form, false);
      // Notify bound fields so the first errored one can focus its input;
      // the payload is the errors Map's first key.
      if (shouldFocusError) {
        const firstKey = form.errors.keys().next().value;
        if (firstKey !== undefined) emit(form.emitter, 'focusError', firstKey);
      }
      if (onInvalidSubmit) onInvalidSubmit(getErrors(form), values);
      return;
    }

    try {
      // Re-read after validation: a schema validator's parsed output
      // landed in parsedValues during validate(), and the submit
      // callbacks must see the coerced values, not the raw
      // pre-validation snapshot.
      const submitted = getValues(form);
      if (onSubmit) await onSubmit(submitted, e);
      if (onValidSubmit) await onValidSubmit(submitted, e);
      if (onAction) {
        const result = await onAction(submitted, e);
        // A server round trip that returns errors is an invalid submit:
        // land them as per-field 'server' errors and mark the attempt
        // unsuccessful.
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
