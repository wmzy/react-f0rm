import {describe, it, expect, vi} from 'vitest';
import {rulesToValidator, rulesToConstraintAttrs} from '../src/rules';

describe('rulesToValidator', () => {
  it('runs a single validate callback after the declarative rules', () => {
    const validate = vi.fn(() => 'nope');
    const validator = rulesToValidator({
      minLength: 3,
      validate
    });
    expect(validator('ab', {form: {}, path: {}})).toEqual([
      {type: 'minLength', message: 'Must be at least 3 characters'},
      {type: 'validate', message: 'nope'}
    ]);
    expect(validate).toHaveBeenCalledWith('ab', {form: {}, path: {}});
  });

  it('types record-form errors by their key', () => {
    const validator = rulesToValidator({
      validate: {
        notWmzy: value => (value === 'wmzy' ? 'no wmzy allowed' : undefined),
        even: value => (value % 2 ? 'must be even' : undefined)
      }
    });
    expect(validator('wmzy', {form: {}, path: {}})).toEqual([
      {type: 'notWmzy', message: 'no wmzy allowed'}
    ]);
    expect(validator(3, {form: {}, path: {}})).toEqual([
      {type: 'even', message: 'must be even'}
    ]);
  });

  it('preserves structured errors and overwrites their type', () => {
    const validator = rulesToValidator({
      validate: {check: () => ({type: 'ignored', message: 'real'})}
    });
    expect(validator('x', {form: {}, path: {}})).toEqual([
      {type: 'check', message: 'real'}
    ]);
  });

  it('skips validate callbacks when required fails', () => {
    const validate = vi.fn(() => 'never');
    const validator = rulesToValidator({
      required: true,
      validate
    });
    expect(validator('', {form: {}, path: {}})).toEqual([
      {type: 'required', message: 'This field is required'}
    ]);
    expect(validate).not.toHaveBeenCalled();
  });

  it('a validate-only rules object validates and stays quiet when clean', () => {
    const validator = rulesToValidator({validate: () => 'bad'});
    expect(validator('x', {form: {}, path: {}})).toEqual([
      {type: 'validate', message: 'bad'}
    ]);
    const passing = rulesToValidator({validate: () => undefined});
    expect(passing('x', {form: {}, path: {}})).toBeUndefined();
  });
});

describe('rulesToConstraintAttrs', () => {
  it('maps every declarative rule onto its native attribute', () => {
    expect(
      rulesToConstraintAttrs({
        required: true,
        min: 2,
        max: 9,
        minLength: 3,
        maxLength: 8,
        pattern: {value: /^\d+$/, message: 'digits only'}
      })
    ).toEqual({
      required: true,
      min: 2,
      max: 9,
      minLength: 3,
      maxLength: 8,
      pattern: '^\\d+$'
    });
  });

  it('pattern maps the regex source, not the message', () => {
    expect(
      rulesToConstraintAttrs({pattern: {value: /a+b/i, message: 'nope'}})
    ).toEqual({pattern: 'a+b'});
  });

  it('validate callbacks and messages have no native counterpart', () => {
    expect(
      rulesToConstraintAttrs({
        validate: () => 'x',
        messages: {min: 'custom'}
      })
    ).toEqual({});
  });

  it('empty rules yield an empty attribute object', () => {
    expect(rulesToConstraintAttrs({})).toEqual({});
  });
});
