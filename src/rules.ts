import type {FieldError} from './form';
import type {SyncValidator} from './hooks/validate';

/** Type tag of a failed rule, as stored on the resulting FieldError. */
export type RuleType =
  'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern';

/**
 * Declarative field rules — a subset of react-hook-form's `register` rules.
 *
 * Failed rules land in the form's error state as FieldErrors (`type` is the
 * rule name) instead of only surfacing through the browser's validity
 * bubble, so any design system can render the messages uniformly.
 */
export type FieldRules = {
  /**
   * Fails on empty values: `''`, `undefined`, `null` or an empty array
   * (`0` and `false` count as filled) — react-hook-form's `required`
   * semantics. A string is the error message; `true` uses the default.
   * When it fails, the remaining rules are skipped — an empty value
   * reports only its required error.
   */
  required?: string | true;
  /** Fails when `Number(value)` is below this bound; `NaN` values skip. */
  min?: number;
  /** Fails when `Number(value)` is above this bound; `NaN` values skip. */
  max?: number;
  /** Fails when a string value is shorter than this, or an array has
   * fewer entries; other values skip. */
  minLength?: number;
  /** Fails when a string value is longer than this, or an array has more
   * entries; other values skip. */
  maxLength?: number;
  /** Fails when the value does not match `pattern.value`. */
  pattern?: {value: RegExp; message: string};
  /**
   * Custom rule callbacks — react-hook-form's `register({validate})`
   * shape: one function, or a record of named functions. Each runs after
   * the declarative checks, and only when they passed (`required` failing
   * short-circuits the rest, RHF's first-error semantics). A returned
   * error keeps its message; its `type` becomes the record key
   * (`'validate'` for the single-function form) so consumers can switch
   * on `error.type`. Sync-only — async checks belong in the field's
   * `validate` option.
   */
  validate?: SyncValidator | Record<string, SyncValidator>;
  /**
   * Overrides the message per rule type — `min`, `max`, `minLength`,
   * `maxLength` defaults and pattern's inline `message` alike — e.g. for
   * centralizing or localizing messages.
   */
  messages?: Partial<Record<Exclude<RuleType, 'required'>, string>>;
};

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

/**
 * Compile declarative {@link FieldRules} into a {@link SyncValidator}.
 *
 * `required` is checked first and, when it fails on an empty value,
 * short-circuits the rest. Every other failing rule is collected into one
 * FieldError[] in declaration order (min, max, minLength, maxLength,
 * pattern); a fully passing value yields undefined. Messages resolve to
 * the rule's own string (required), `rules.messages`, or the default.
 *
 * @param rules declarative constraints
 * @return synchronous validator producing FieldError[] | undefined
 */
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
        // Each custom rule owns its `type`: the record key (or
        // 'validate' for the single-function form), so consumers can
        // switch on error.type like with every declarative rule.
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

/**
 * Map declarative {@link FieldRules} onto native HTML constraint
 * attributes — the subset the platform exposes: `required`, `min`,
 * `max`, `minLength`, `maxLength`, `pattern`. Rendered onto a bound
 * control they give browsers and assistive tech the native hints
 * (`:invalid`/`:user-invalid` styling, screen-reader announcements,
 * mobile input modes) while the store-based pipeline stays the source of
 * truth for messages: `rulesToValidator` still lands errors in the form
 * state and `renderError`/`aria-invalid` keep working. `validate`
 * callbacks have no native counterpart and are skipped. Native `min`/
 * `max` only constrain numeric/date inputs; the store checks apply
 * regardless of input type — render hints, not the validation gate.
 */
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
