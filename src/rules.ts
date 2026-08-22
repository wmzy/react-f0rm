import type {FieldError} from './form';
import type {Validator} from './hooks/validate';

/** Type tag of a failed rule, as stored on the resulting FieldError. */
export type RuleType =
  | 'required'
  | 'min'
  | 'max'
  | 'minLength'
  | 'maxLength'
  | 'pattern';

/**
 * Declarative field rules — a subset of react-hook-form's `register` rules.
 *
 * Failed rules land in the form's error state as FieldErrors (`type` is the
 * rule name) instead of only surfacing through the browser's validity
 * bubble, so any design system can render the messages uniformly.
 */
export interface FieldRules {
  /**
   * Fails on empty values: `''`, `undefined` or `null` (`0` and `false`
   * count as filled). A string is the error message; `true` uses the
   * default. When it fails, the remaining rules are skipped — an empty
   * value reports only its required error.
   */
  required?: string | true;
  /** Fails when `Number(value)` is below this bound; `NaN` values skip. */
  min?: number;
  /** Fails when `Number(value)` is above this bound; `NaN` values skip. */
  max?: number;
  /** Fails when a string value is shorter than this; non-strings skip. */
  minLength?: number;
  /** Fails when a string value is longer than this; non-strings skip. */
  maxLength?: number;
  /** Fails when the value does not match `pattern.value`. */
  pattern?: {value: RegExp; message: string};
  /**
   * Overrides the message per rule type — `min`, `max`, `minLength`,
   * `maxLength` defaults and pattern's inline `message` alike — e.g. for
   * centralizing or localizing messages.
   */
  messages?: Partial<Record<Exclude<RuleType, 'required'>, string>>;
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

/**
 * Compile declarative {@link FieldRules} into a {@link Validator}.
 *
 * `required` is checked first and, when it fails on an empty value,
 * short-circuits the rest. Every other failing rule is collected into one
 * FieldError[] in declaration order (min, max, minLength, maxLength,
 * pattern); a fully passing value yields undefined. Messages resolve to
 * the rule's own string (required), `rules.messages`, or the default.
 *
 * @param rules declarative constraints
 * @return validator producing FieldError[] | undefined
 */
export function rulesToValidator(rules: FieldRules): Validator {
  return value => {
    if (rules.required) {
      if (value === '' || value === undefined || value === null) {
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
    if (
      rules.minLength !== undefined &&
      typeof value === 'string' &&
      value.length < rules.minLength
    ) {
      errors.push({
        type: 'minLength',
        message: message('minLength', rules.minLength)
      });
    }
    if (
      rules.maxLength !== undefined &&
      typeof value === 'string' &&
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
    return errors.length ? errors : undefined;
  };
}
