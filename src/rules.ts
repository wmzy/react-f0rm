import type {FieldError} from './form';
import type {SyncValidator} from './hooks/validate';

/** Type tag of a failed rule, as stored on the resulting FieldError. */
export type RuleType =
  'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern';

/** Form-level default rule messages — the `createForm({messages})` table
 * overriding the built-in English defaults for every field (i18n in one
 * place). A string may carry a `{bound}` placeholder (replaced with the
 * rule's bound); a function receives the bound. A field's own message
 * (the `required` string, `rules.messages`, `pattern.message`) still
 * wins. */
export type FormMessages = Partial<
  Record<RuleType, string | ((bound?: number) => string)>
>;

/** Declarative field rules — a subset of react-hook-form's `register`
 * rules. Failures land in the error state as FieldErrors (`type` = rule
 * name), so any design system can render them. */
export type FieldRules = {
  /** Fails on `''`, `undefined`, `null` or an empty array (`0`/`false`
   * count as filled). A string is the message, `true` the default; failing
   * skips the remaining rules. */
  required?: string | true;
  /** Fails when `Number(value)` is below this bound; `NaN` values skip. */
  min?: number;
  /** Fails when `Number(value)` is above this bound; `NaN` values skip. */
  max?: number;
  /** Fails when a string/array is shorter than this; other values skip. */
  minLength?: number;
  /** Fails when a string/array is longer than this; other values skip. */
  maxLength?: number;
  /** Fails when the value does not match `pattern.value`. */
  pattern?: {value: RegExp; message: string};
  /** Custom rule callbacks (one function or a named record), run after the
   * declarative checks pass. A returned error keeps its message; `type`
   * becomes the record key (`'validate'` for the single-function form).
   * Sync-only. */
  validate?: SyncValidator | Record<string, SyncValidator>;
  /** Per-rule-type message override (defaults and pattern's inline message). */
  messages?: Partial<Record<Exclude<RuleType, 'required'>, string>>;
};

/** Does `rules` declare any constraint? `messages` alone would still open
 * debounce windows and hold the validating mark for nothing; `validate`
 * callbacks count. */
export function hasRuleConstraints(rules: FieldRules): boolean {
  return (
    rules.required !== undefined ||
    rules.min !== undefined ||
    rules.max !== undefined ||
    rules.minLength !== undefined ||
    rules.maxLength !== undefined ||
    rules.pattern !== undefined ||
    rules.validate !== undefined
  );
}

/** Default English messages, aligned with RHF's default-message style. */
function defaultMessage(type: RuleType, bound?: number): string {
  switch (type) {
    case 'required':
      return 'This field is required';
    case 'min':
      return `Must be at least ${bound}`;
    case 'max':
      return `Must be at most ${bound}`;
    case 'minLength':
      return `Must be at least ${bound} characters`;
    case 'maxLength':
      return `Must be at most ${bound} characters`;
    case 'pattern':
      return 'Invalid format';
    default:
      return 'Invalid value';
  }
}

/** Resolve a form-level override entry: a function takes the bound, a
 * string gets its `{bound}` placeholder replaced. */
function resolveMessage(
  entry: string | ((bound?: number) => string) | undefined,
  bound?: number
): string | undefined {
  return typeof entry === 'function'
    ? entry(bound)
    : entry?.replace('{bound}', String(bound));
}

/** One bound rule: the FieldRules key, how `value` is measured
 * (`undefined` skips — `NaN` numbers, unsized values), and which side of
 * the bound fails. */
type BoundCheck = readonly [
  type: Exclude<RuleType, 'required' | 'pattern'>,
  measure: (value: any) => number | undefined,
  fails: (metric: number, bound: number) => boolean
];

function numericMetric(value: any): number | undefined {
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function sizedMetric(value: any): number | undefined {
  return typeof value === 'string' || Array.isArray(value)
    ? value.length
    : undefined;
}

/** The bound checks in declaration order. */
const BOUND_CHECKS: readonly BoundCheck[] = [
  ['min', numericMetric, (metric, bound) => metric < bound],
  ['max', numericMetric, (metric, bound) => metric > bound],
  ['minLength', sizedMetric, (metric, bound) => metric < bound],
  ['maxLength', sizedMetric, (metric, bound) => metric > bound]
];

/** Compile {@link FieldRules} into a {@link SyncValidator}: `required`
 * short-circuits the rest when it fails; other failures collect into one
 * FieldError[] in declaration order. Messages resolve to the rule's own
 * string, `rules.messages`, the form-level {@link FormMessages} table,
 * or the default. */
export function rulesToValidator(
  rules: FieldRules,
  formMessages?: FormMessages
): SyncValidator {
  return (value, meta) => {
    if (rules.required) {
      if (
        value === '' ||
        value === undefined ||
        value === null ||
        (Array.isArray(value) && value.length === 0)
      ) {
        return [
          {
            type: 'required',
            message:
              typeof rules.required === 'string'
                ? rules.required
                : (resolveMessage(formMessages?.required) ??
                  defaultMessage('required'))
          }
        ];
      }
    }
    const errors: FieldError[] = [];
    const message = (type: Exclude<RuleType, 'required'>, bound: number) =>
      rules.messages?.[type] ??
      resolveMessage(formMessages?.[type], bound) ??
      defaultMessage(type, bound);
    for (const [type, measure, fails] of BOUND_CHECKS) {
      const bound = rules[type];
      if (bound === undefined) continue;
      const metric = measure(value);
      if (metric !== undefined && fails(metric, bound)) {
        errors.push({type, message: message(type, bound)});
      }
    }
    if (rules.pattern && !rules.pattern.value.test(value)) {
      errors.push({
        type: 'pattern',
        // pattern.message is type-required but JS consumers may omit it.
        message:
          rules.messages?.pattern ??
          rules.pattern.message ??
          resolveMessage(formMessages?.pattern) ??
          defaultMessage('pattern')
      });
    }
    if (rules.validate !== undefined) {
      const fns =
        typeof rules.validate === 'function'
          ? {validate: rules.validate}
          : rules.validate;
      for (const [type, fn] of Object.entries(fns)) {
        const result = fn(value, meta);
        if (result === undefined) continue;
        // Each custom rule owns its `type`: the record key (or 'validate').
        for (const entry of Array.isArray(result) ? result : [result]) {
          errors.push(
            typeof entry === 'string'
              ? {type, message: entry}
              : {...entry, type}
          );
        }
      }
    }
    return errors.length ? errors : undefined;
  };
}

/** Map {@link FieldRules} onto native constraint attributes (the subset
 * the platform exposes): browser/AT hints only — the store pipeline stays
 * the source of truth for messages. `validate` callbacks are skipped. */
export function rulesToConstraintAttrs(rules: FieldRules): Record<string, any> {
  const attrs: Record<string, any> = {};
  if (rules.required) attrs.required = true;
  for (const key of ['min', 'max', 'minLength', 'maxLength'] as const) {
    if (rules[key] !== undefined) attrs[key] = rules[key];
  }
  if (rules.pattern) attrs.pattern = rules.pattern.value.source;
  return attrs;
}
