import * as React from 'react';
import {useContext, useEffect, useId, useState} from 'react';
import type {KeyboardEvent} from 'react';
import {on} from '../emitter';
import {FormContext} from '../context';
import {getErrors, getValues, reset, trigger} from '../form';
import type {FieldErrorEntry, Form, FormEvents} from '../form';
import type {Path} from '../path';
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
  /** Form to inspect; omitted, reads the closest <Form>/FormProvider and throws if none. */
  form?: Form<T>;
  /** Corner to dock the panel in. Defaults to `'top-right'`. */
  position?: DevtoolsPosition;
};

const TABS = [
  'values',
  'errors',
  'touched',
  'dirty',
  'submits',
  'subs',
  'events'
] as const;

type TabId = (typeof TABS)[number];

type EventNameOf<E> = E extends readonly [infer N, unknown] ? N : never;

/** Union of every event name in the FormEvents table. */
type FormEventName = EventNameOf<FormEvents>;

/** Audited event types in FormEvents declaration order — the subs tab
 * renders one row per entry, so row order stays stable. */
const SUBS_EVENTS = [
  'change',
  'errors',
  'touched',
  'validating',
  'submitting',
  'submitCount',
  'submitSuccessful',
  'reset',
  'disabled',
  'status',
  'loading',
  'focusError'
] as const satisfies readonly FormEventName[];

/** One event type's row on the subs tab: lifetime trigger count plus the
 * dotted path of its latest payload. */
type EventStat = {
  count: number;
  last?: string;
};

/** One emitted form event, newest first in the event timeline tab. */
type EventTrace = {
  n: number;
  event: string;
  at: number;
  path?: string;
};

/** One completed submit attempt, snapshotted when `isSubmitting` flips
 * false — outcome/values/errors are settled by then. */
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
  return Object.values(value as Record<string, unknown>).reduce<number>(
    (sum, child) => sum + countLeaves(child),
    0
  );
}

/** Status label for the submit-successful indicator. */
function submitStatusLabel(ok: boolean | undefined): string {
  if (ok === undefined) return '–';
  return ok ? 'ok' : 'failed';
}

// Arrow-key tab navigation — buttons stay click/Enter/Space operable.
const ARROW_DELTAS: Record<string, number> = {ArrowRight: 1, ArrowLeft: -1};

type TabListProps = {
  tab: TabId;
  idPrefix: string;
  counts: Record<TabId, number>;
  onSelect: (tab: TabId) => void;
};

/** Tab strip; buttons stay click/Enter/Space operable, arrows move focus. */
function TabList({
  tab,
  idPrefix,
  counts,
  onSelect
}: TabListProps): React.JSX.Element {
  const onKeyDown = (e: KeyboardEvent) => {
    const delta = ARROW_DELTAS[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + delta + TABS.length) % TABS.length];
    onSelect(next);
    document.getElementById(`${idPrefix}-tab-${next}`)?.focus();
  };

  return (
    <div
      className="rf0-dt-tablist"
      role="tablist"
      aria-label="Form state"
      tabIndex={-1}
      onKeyDown={onKeyDown}
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
          onClick={() => onSelect(id)}
        >
          {id}
          <span className="rf0-dt-tab-count">{counts[id]}</span>
        </button>
      ))}
    </div>
  );
}

type ErrorItemProps = {path: string; type: string; message: string};

/** One flattened error row (shared by the errors tab and submit traces). */
function ErrorItem({path, type, message}: ErrorItemProps): React.JSX.Element {
  return (
    <div className="rf0-dt-item">
      <span className="rf0-dt-item-path">{path}</span>
      <span className="rf0-dt-item-msg">{message}</span>
      <span className="rf0-dt-item-tag">{type}</span>
    </div>
  );
}

function ErrorList({errors}: {errors: FieldErrorEntry[]}): React.JSX.Element {
  if (errors.length === 0) return <p className="rf0-dt-empty">no errors</p>;
  return (
    <>
      {/* Same path can hold several errors; index keeps keys unique. */}
      {errors.map(({path, type, message}, index) => (
        <ErrorItem
          key={`${path}:${index}`}
          path={path}
          type={type}
          message={message}
        />
      ))}
    </>
  );
}

function TouchedList({touched}: {touched: string[]}): React.JSX.Element {
  if (touched.length === 0)
    return <p className="rf0-dt-empty">no touched fields</p>;
  return (
    <>
      {touched.map(path => (
        <div key={path} className="rf0-dt-item rf0-dt-item--touched">
          <span className="rf0-dt-item-path">{path}</span>
        </div>
      ))}
    </>
  );
}

function DirtyList({
  dirty
}: {
  dirty: Record<string, boolean>;
}): React.JSX.Element {
  const paths = Object.keys(dirty);
  if (paths.length === 0)
    return <p className="rf0-dt-empty">no dirty fields</p>;
  return (
    <>
      {paths.map(path => (
        <div key={path} className="rf0-dt-item rf0-dt-item--dirty">
          <span className="rf0-dt-item-path">{path}</span>
          <span className="rf0-dt-item-msg rf0-dt-item-msg--ok">changed</span>
        </div>
      ))}
    </>
  );
}

function SubmitTraceList({
  submits
}: {
  submits: SubmitTrace[];
}): React.JSX.Element {
  if (submits.length === 0)
    return <p className="rf0-dt-empty">no submits yet</p>;
  return (
    <>
      {submits.map(trace => (
        <SubmitTraceItem key={`${trace.n}-${trace.at}`} trace={trace} />
      ))}
    </>
  );
}

function SubmitTraceItem({trace}: {trace: SubmitTrace}): React.JSX.Element {
  return (
    <details className="rf0-dt-submit">
      <summary className="rf0-dt-submit-summary">
        <span className="rf0-dt-submit-n">#{trace.n}</span>
        <span className={submitStatusClass(trace.ok)}>
          {submitStatusLabel(trace.ok)}
        </span>
        <span className="rf0-dt-submit-time">
          {new Date(trace.at).toLocaleTimeString()}
        </span>
      </summary>
      {trace.errors.length > 0 && (
        <div className="rf0-dt-submit-errors">
          <ErrorList errors={trace.errors} />
        </div>
      )}
      <JsonTree value={trace.values} />
    </details>
  );
}

function EventStream({
  events,
  onClear
}: {
  events: EventTrace[];
  onClear: () => void;
}): React.JSX.Element {
  if (events.length === 0) return <p className="rf0-dt-empty">no events yet</p>;
  return (
    <>
      <div>
        <button type="button" className="rf0-dt-action" onClick={onClear}>
          Clear
        </button>
      </div>
      {events.map(trace => (
        <div key={`${trace.n}:${trace.at}`} className="rf0-dt-item">
          <span className="rf0-dt-item-tag">{trace.event}</span>
          <span className="rf0-dt-item-path">{trace.path ?? '—'}</span>
          <span className="rf0-dt-item-msg rf0-dt-item-msg--ok">
            {new Date(trace.at).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </>
  );
}

/** Subscription audit — one row per event type in {@link SUBS_EVENTS}
 * order: lifetime trigger count plus the latest payload's dotted path.
 * The emitter API exposes no listenerCount/eventNames, so live listener
 * totals are deliberately absent (never monkey-patch emit). */
function SubsList({
  stats
}: {
  stats: Partial<Record<FormEventName, EventStat>>;
}): React.JSX.Element {
  return (
    <>
      {SUBS_EVENTS.map(event => {
        const stat = stats[event];
        return (
          <div key={event} className="rf0-dt-item">
            <span className="rf0-dt-item-tag">{event}</span>
            <span className="rf0-dt-item-path">{stat?.last ?? '—'}</span>
            <span className="rf0-dt-item-msg rf0-dt-item-msg--ok">
              {stat?.count ?? 0}
            </span>
          </div>
        );
      })}
    </>
  );
}

type PanelProps = {
  tab: TabId;
  values: unknown;
  errors: FieldErrorEntry[];
  touched: string[];
  dirty: Record<string, boolean>;
  submits: SubmitTrace[];
  stats: Partial<Record<FormEventName, EventStat>>;
  events: EventTrace[];
  onClearEvents: () => void;
};

/** Content for the active tab. */
function Panel({
  tab,
  values,
  errors,
  touched,
  dirty,
  submits,
  stats,
  events,
  onClearEvents
}: PanelProps): React.JSX.Element {
  if (tab === 'values') return <JsonTree value={values} />;
  if (tab === 'errors') return <ErrorList errors={errors} />;
  if (tab === 'touched') return <TouchedList touched={touched} />;
  if (tab === 'dirty') return <DirtyList dirty={dirty} />;
  if (tab === 'submits') return <SubmitTraceList submits={submits} />;
  if (tab === 'subs') return <SubsList stats={stats} />;
  return <EventStream events={events} onClear={onClearEvents} />;
}

/** Live form inspector — a floating dev panel. Tabs for values / errors /
 * touched / dirty / submits (per-attempt traces) / events / subs
 * (per-event-type audit) plus a status strip and Reset/Validate actions.
 * Reads state through the library's watch hooks, so it updates live
 * without participating in validation/submit. Docked
 * at a corner, collapsible; keyboard operable. Not re-exported by the
 * main entry. */
export default function Devtools<T extends Record<string, any> = any>({
  form,
  position = 'top-right'
}: DevtoolsProps<T>): React.JSX.Element {
  // Module-scope call keeps the entry free of import-time side effects
  // (sideEffects: false lets bundlers drop bare imports).
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

  // Submit traces: snapshot each completed attempt ('submitting' emit with
  // isSubmitting=false), capped at 10 newest-first. The push is deferred
  // one microtask — the failed path flips isSubmitting before
  // isSubmitSuccessful — so by microtask time the attempt is final.
  // setState from an event callback, never the effect body or render.
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

  // Event timeline: every event lands here, newest first, capped at 50.
  // State writes ride the event callback (never the effect body/render).
  const [events, setEvents] = useState<EventTrace[]>([]);
  // Per-event audit for the subs tab — accumulated by the same on()
  // callbacks below (no second subscription). Counts need no deferred
  // read, unlike submit traces: nothing settles after the emit.
  const [stats, setStats] = useState<Partial<Record<FormEventName, EventStat>>>(
    {}
  );
  useEffect(() => {
    let seq = 0;
    const push = (event: FormEventName, path?: string) => {
      seq += 1;
      const trace: EventTrace = {n: seq, event, at: Date.now()};
      if (path !== undefined) trace.path = path;
      setEvents(prev => [trace, ...prev].slice(0, 50));
      setStats(prev => {
        const prior = prev[event];
        const stat: EventStat = {count: (prior?.count ?? 0) + 1};
        if (path !== undefined) stat.last = path;
        else if (prior?.last !== undefined) stat.last = prior.last;
        const next = {...prev};
        next[event] = stat;
        return next;
      });
    };
    const disposers: Array<() => void> = [];
    // 'disabled' carries an optional path like the field events.
    for (const event of [
      'change',
      'errors',
      'touched',
      'validating',
      'disabled'
    ] as const) {
      disposers.push(
        on(f.emitter, event, (path?: Path) =>
          push(event, path ? path.value.join('.') : undefined)
        )
      );
    }
    disposers.push(
      on(f.emitter, 'focusError', (key: string) => {
        // The key is JSON-serialized segments — pretty-print it; malformed
        // input falls back to the raw key.
        try {
          push('focusError', (JSON.parse(key) as string[]).join('.'));
        } catch {
          push('focusError', key);
        }
      })
    );
    for (const event of [
      'submitting',
      'submitCount',
      'submitSuccessful',
      'reset',
      'status',
      'loading'
    ] as const) {
      disposers.push(on(f.emitter, event, () => push(event)));
    }
    return () => disposers.forEach(dispose => dispose());
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
    submits: submits.length,
    subs: Object.keys(stats).length,
    events: events.length
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

      <TabList
        tab={tab}
        idPrefix={idPrefix}
        counts={counts}
        onSelect={setTab}
      />

      <div
        id={`${idPrefix}-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${tab}`}
        className="rf0-dt-panel"
      >
        <Panel
          tab={tab}
          values={values}
          errors={errors}
          touched={touched}
          dirty={dirty}
          submits={submits}
          stats={stats}
          events={events}
          onClearEvents={() => setEvents([])}
        />
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
