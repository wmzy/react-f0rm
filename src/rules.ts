import type {FieldError} from './form';
import type {SyncValidator} from './hooks/validate';

/** Type tag of a failed rule, as stored on the resulting FieldError. */
export type RuleType =
  'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern';

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

/** Compile {@link FieldRules} into a {@link SyncValidator}: `required`
 * short-circuits the rest when it fails; other failures collect into one
 * FieldError[] in declaration order. Messages resolve to the rule's own
 * string, `rules.messages`, or the default. */
export function rulesToValidator(rules: FieldRules): SyncValidator {
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
                : defaultMessage('required')
          }
        ];
      }
    }
    const errors: FieldError[] = [];
    const message = (type: Exclude<RuleType, 'required'>, bound: number) =>
      rules.messages?.[type] ?? defaultMessage(type, bound);
    if (rules.min !== undefined) {
      const n = Number(value);
      if (!Number.isNaN(n) && n < rules.min) {
        errors.push({type: 'min', message: message('min', rules.min)});
      }
    }
    if (rules.max !== undefined) {
      const n = Number(value);
      if (!Number.isNaN(n) && n > rules.max) {
        errors.push({type: 'max', message: message('max', rules.max)});
      }
    }
    const isSized = typeof value === 'string' || Array.isArray(value);
    if (
      rules.minLength !== undefined &&
      isSized &&
      value.length < rules.minLength
    ) {
      errors.push({
        type: 'minLength',
        message: message('minLength', rules.minLength)
      });
    }
    if (
      rules.maxLength !== undefined &&
      isSized &&
      value.length > rules.maxLength
    ) {
      errors.push({
        type: 'maxLength',
        message: message('maxLength', rules.maxLength)
      });
    }
    if (rules.pattern && !rules.pattern.value.test(value)) {
      errors.push({
        type: 'pattern',
        // pattern.message is type-required but JS consumers may omit it.
        message:
          rules.messages?.pattern ??
          rules.pattern.message ??
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
  if (rules.min !== undefined) attrs.min = rules.min;
  if (rules.max !== undefined) attrs.max = rules.max;
  if (rules.minLength !== undefined) attrs.minLength = rules.minLength;
  if (rules.maxLength !== undefined) attrs.maxLength = rules.maxLength;
  if (rules.pattern) attrs.pattern = rules.pattern.value.source;
  return attrs;
}
