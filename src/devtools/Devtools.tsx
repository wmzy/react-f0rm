import * as React from 'react';
import {useContext, useEffect, useId, useState} from 'react';
import type {KeyboardEvent} from 'react';
import {on} from '../emitter';
import {FormContext} from '../context';
import {getErrors, getValues, reset, trigger} from '../form';
import type {FieldErrorEntry, Form} from '../form';
import {
  useDirtyFields,
  useIsSubmitting,
  useSubmitCount,
  useTouchedFields,
  useWatch
} from '../hooks/form';
import JsonTree from './JsonTree';
import {injectDevtoolsStyles} from './styles';

/** Corner the panel docks to. */
export type DevtoolsPosition =
  'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';

/** Props for {@link Devtools}. */
export type DevtoolsProps<T extends Record<string, any> = any> = {
  /**
   * Form instance to inspect. When omitted, the panel reads the closest
   * `<Form>` / FormProvider ancestor and throws if there is none.
   */
  form?: Form<T>;
  /** Corner to dock the panel in. Defaults to `'top-right'`. */
  position?: DevtoolsPosition;
};

type TabId = 'values' | 'errors' | 'touched' | 'dirty' | 'submits';

const TABS: TabId[] = ['values', 'errors', 'touched', 'dirty', 'submits'];

/** One completed submit attempt, snapshotted when `isSubmitting` flips
 * back to false — the outcome, final (schema-coerced) values and errors
 * are all settled by then (submit.ts lands them before the flip). */
type SubmitTrace = {
  n: number;
  ok: boolean | undefined;
  at: number;
  values: unknown;
  errors: FieldErrorEntry[];
};

/** Status chip class for the submit-successful indicator. */
function submitStatusClass(
  isSubmitSuccessful: boolean | undefined
): string | undefined {
  if (isSubmitSuccessful === undefined) return undefined;
  return isSubmitSuccessful ? 'rf0-dt-ok' : 'rf0-dt-err';
}

/** Count primitive leaves of an inspected value tree. */
function countLeaves(value: unknown): number {
  if (value === null || typeof value !== 'object') return 1;
  let count = 0;
  for (const v of Object.values(value as Record<string, unknown>)) {
    count += countLeaves(v);
  }
  return count;
}

/**
 * Live form inspector — a floating instrument panel for development.
 *
 * Renders five tabs (values / errors / touched / dirty / submits — the
 * last a per-attempt trace of outcome, final values and errors), a submit
 * status strip (isSubmitting, submitCount, isSubmitSuccessful) and two actions:
 * Reset and Validate (full `trigger`). All state is read through the
 * library's own watch hooks, so the panel updates in real time without
 * participating in validation or submit flows. Docked at a corner,
 * collapsible to a small badge; fully keyboard operable.
 *
 * Ship it from the dedicated `react-f0rm/devtools` entry — it is never
 * re-exported by the main entry, so production bundles stay untouched.
 */
export default function Devtools<T extends Record<string, any> = any>({
  form,
  position = 'top-right'
}: DevtoolsProps<T>) {
  // Idempotent + SSR-guarded; moving it off module scope keeps the
  // devtools entry free of import-time side effects (package.json
  // declares `sideEffects: false`, so bundlers may drop a bare
  // `import './styles'` in production builds).
  injectDevtoolsStyles();
  const contextForm = useContext(FormContext);
  const f: Form<any> | null = form ?? contextForm;
  if (!f) {
    throw new Error(
      '<Devtools> needs a form: pass the `form` prop or render it inside a <Form> / FormProvider.'
    );
  }

  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<TabId>('values');
  const idPrefix = useId().replace(/[^a-zA-Z0-9-]/g, '');

  // Live snapshots, straight through the public watch surface.
  const values = useWatch(f, 'change', getValues.bind(null, f));
  const errors = useWatch<FieldErrorEntry[]>(
    f,
    'errors',
    getErrors.bind(null, f)
  );
  const touched = useTouchedFields(f);
  const dirty = useDirtyFields(f);
  const isSubmitting = useIsSubmitting(f);
  const submitCount = useSubmitCount(f);
  const isSubmitSuccessful = useWatch(
    f,
    'submitSuccessful',
    () => f.isSubmitSuccessful
  );

  // Submit traces: each completed attempt (the 'submitting' emit carrying
  // isSubmitting=false) is snapshotted once — outcome, values and errors,
  // kept capped at the 10 most recent attempts, newest first. The push is
  // deferred one microtask because the failed path flips isSubmitting
  // before isSubmitSuccessful; by microtask time the attempt's state is
  // final. setState from an event-driven callback, never from the effect
  // body or during render.
  const [submits, setSubmits] = useState<SubmitTrace[]>([]);
  useEffect(() => {
    return on(f.emitter, 'submitting', () => {
      if (f.isSubmitting) return;
      queueMicrotask(() => {
        if (f.isSubmitting || f.submitCount === 0) return;
        setSubmits(prev =>
          [
            {
              n: f.submitCount,
              ok: f.isSubmitSuccessful,
              at: Date.now(),
              values: getValues(f),
              errors: getErrors(f)
            },
            ...prev
          ].slice(0, 10)
        );
      });
    });
  }, [f]);

  if (!open) {
    return (
      <button
        type="button"
        className={`rf0-dt-badge rf0-dt-badge--${position}${
          errors.length > 0 ? ' rf0-dt-badge--has-errors' : ''
        }`}
        aria-expanded={false}
        aria-label={`Open react-f0rm devtools (${errors.length} errors)`}
        onClick={() => setOpen(true)}
      >
        f0
        <span className="rf0-dt-dot" />
      </button>
    );
  }

  const counts: Record<TabId, number> = {
    values: countLeaves(values),
    errors: errors.length,
    touched: touched.length,
    dirty: Object.keys(dirty).length,
    submits: submits.length
  };

  /** Arrow-key tab navigation (buttons stay click/Enter/Space operable). */
  const onTabKeyDown = (e: KeyboardEvent) => {
    const deltas: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1
    };
    const delta = deltas[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + delta + TABS.length) % TABS.length];
    setTab(next);
    document.getElementById(`${idPrefix}-tab-${next}`)?.focus();
  };

  return (
    <section
      className={`rf0-dt rf0-dt--${position}`}
      aria-label="react-f0rm devtools"
    >
      <header className="rf0-dt-header">
        <span className="rf0-dt-title">react-f0rm</span>
        <button
          type="button"
          className="rf0-dt-headerbtn"
          aria-label="Collapse devtools"
          onClick={() => setOpen(false)}
        >
          –
        </button>
      </header>

      <div
        className="rf0-dt-tablist"
        role="tablist"
        aria-label="Form state"
        tabIndex={-1}
        onKeyDown={onTabKeyDown}
      >
        {TABS.map(id => (
          <button
            key={id}
            id={`${idPrefix}-tab-${id}`}
            type="button"
            role="tab"
            className={`rf0-dt-tab${id === 'errors' ? ' rf0-dt-tab--danger' : ''}`}
            aria-selected={tab === id}
            aria-controls={`${idPrefix}-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            {id}
            <span className="rf0-dt-tab-count">{counts[id]}</span>
          </button>
        ))}
      </div>

      <div
        id={`${idPrefix}-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${tab}`}
        className="rf0-dt-panel"
      >
        {tab === 'values' && <JsonTree value={values} />}
        {tab === 'errors' &&
          (errors.length === 0 ? (
            <p className="rf0-dt-empty">no errors</p>
          ) : (
            errors.map(({path, type, message}, index) => (
              // Same path can hold several errors now; index keeps keys
              // unique without changing what is rendered (messages may
              // legitimately repeat for one path).

              <div key={`${path}:${index}`} className="rf0-dt-item">
                <span className="rf0-dt-item-path">{path}</span>
                <span className="rf0-dt-item-msg">{message}</span>
                <span className="rf0-dt-item-tag">{type}</span>
              </div>
            ))
          ))}
        {tab === 'touched' &&
          (touched.length === 0 ? (
            <p className="rf0-dt-empty">no touched fields</p>
          ) : (
            touched.map(path => (
              <div key={path} className="rf0-dt-item rf0-dt-item--touched">
                <span className="rf0-dt-item-path">{path}</span>
              </div>
            ))
          ))}
        {tab === 'dirty' &&
          (Object.keys(dirty).length === 0 ? (
            <p className="rf0-dt-empty">no dirty fields</p>
          ) : (
            Object.keys(dirty).map(path => (
              <div key={path} className="rf0-dt-item rf0-dt-item--dirty">
                <span className="rf0-dt-item-path">{path}</span>
                <span className="rf0-dt-item-msg rf0-dt-item-msg--ok">
                  changed
                </span>
              </div>
            ))
          ))}
        {tab === 'submits' &&
          (submits.length === 0 ? (
            <p className="rf0-dt-empty">no submits yet</p>
          ) : (
            submits.map(trace => (
              <details key={`${trace.n}-${trace.at}`} className="rf0-dt-submit">
                <summary className="rf0-dt-submit-summary">
                  <span className="rf0-dt-submit-n">#{trace.n}</span>
                  <span className={submitStatusClass(trace.ok)}>
                    {trace.ok === true
                      ? 'ok'
                      : trace.ok === false
                        ? 'failed'
                        : '–'}
                  </span>
                  <span className="rf0-dt-submit-time">
                    {new Date(trace.at).toLocaleTimeString()}
                  </span>
                </summary>
                {trace.errors.length > 0 && (
                  <div className="rf0-dt-submit-errors">
                    {trace.errors.map(({path, type, message}, index) => (
                      <div key={`${path}:${index}`} className="rf0-dt-item">
                        <span className="rf0-dt-item-path">{path}</span>
                        <span className="rf0-dt-item-msg">{message}</span>
                        <span className="rf0-dt-item-tag">{type}</span>
                      </div>
                    ))}
                  </div>
                )}
                <JsonTree value={trace.values} />
              </details>
            ))
          ))}
      </div>

      <p className="rf0-dt-status" aria-live="polite">
        <span className={isSubmitting ? 'rf0-dt-on' : undefined}>
          submitting <b>{String(isSubmitting)}</b>
        </span>
        <span>
          submits <b>{submitCount}</b>
        </span>
        <span className={submitStatusClass(isSubmitSuccessful)}>
          ok{' '}
          <b>
            {isSubmitSuccessful === undefined
              ? '–'
              : String(isSubmitSuccessful)}
          </b>
        </span>
      </p>

      <div className="rf0-dt-actions">
        <button
          type="button"
          className="rf0-dt-action"
          onClick={() => reset(f, f.initialValues)}
        >
          Reset
        </button>
        <button
          type="button"
          className="rf0-dt-action"
          onClick={() => trigger(f)}
        >
          Validate
        </button>
      </div>
    </section>
  );
}
