import * as React from 'react';
import {on} from '../emitter';
import {FormContext} from '../context';
import {useErrors, useWatchCore} from '../hooks/form';
import {FORM_ERROR, dottedKeyToFieldPath, hasErrors, setFocus} from '../form';
import type {FieldError, Form} from '../form';
import {fieldErrorId} from '../errorId';

/** Props for <ErrorSummary>: same form/context resolution <Form> itself
 * uses — an explicit `form` wins, otherwise the (optionally isolated)
 * context form. */
type ErrorSummaryProps<T extends Record<string, any> = any> = {
  form?: Form<T>;
  context?: React.Context<Form<any> | null>;
  heading?: string;
};

/** A GOV.UK-style error summary: one `role='alert'` box listing every
 * field error, each linking to the field's error element id. Clicking a
 * link focuses the field through the same `focusError` channel a failed
 * submit uses; after a failed submit the box itself takes focus (pair it
 * with `shouldFocusError={false}`, whose field focus lands later and
 * would otherwise win). {@link FORM_ERROR} entries have no field to focus
 * and render as plain list items. */
export default function ErrorSummary<T extends Record<string, any> = any>({
  form: formProp,
  context,
  heading
}: ErrorSummaryProps<T>): React.ReactElement | null {
  const contextForm = React.useContext(context ?? FormContext);
  const form = formProp ?? contextForm;
  if (!form) throw new Error('no form provided');
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const wasSubmittingRef = React.useRef(false);
  const headingId = React.useId();
  const errors = useErrors(form);
  // Focus the box on the failed-submit transition (isSubmitting
  // true→false with errors) — the same dual-event subscription useCanSubmit
  // folds its boolean from. The snapshot is inert (a constant never
  // triggers a re-render); the transition detection is a DOM focus in the
  // event callback, never setState.
  const subscribeFactory = React.useCallback(
    (invalidate: () => void) => {
      const check = () => {
        const wasSubmitting = wasSubmittingRef.current;
        wasSubmittingRef.current = form.isSubmitting;
        if (wasSubmitting && !form.isSubmitting && hasErrors(form)) {
          containerRef.current?.focus();
        }
        invalidate();
      };
      const offErrors = on(form.emitter, 'errors', check);
      const offSubmitting = on(form.emitter, 'submitting', check);
      return () => {
        offErrors();
        offSubmitting();
      };
    },
    [form]
  );
  useWatchCore(subscribeFactory, () => null);

  const entries = Object.entries(errors) as [string, FieldError[]][];
  if (entries.length === 0) return null;
  return (
    <div
      role="alert"
      tabIndex={-1}
      ref={containerRef}
      aria-labelledby={headingId}
    >
      <h2 id={headingId}>{heading ?? 'There is a problem'}</h2>
      <ul>
        {entries.map(([dottedKey, list]) => {
          const message = list[0]?.message;
          // The form-level error has no field element to focus — no link.
          if (dottedKey === FORM_ERROR) {
            return (
              <li key={dottedKey}>
                <p>{message}</p>
              </li>
            );
          }
          const path = dottedKeyToFieldPath(dottedKey);
          return (
            <li key={dottedKey}>
              <a
                href={`#${fieldErrorId(path)}`}
                onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault();
                  setFocus(form, path);
                }}
              >
                {message}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
