import {createRequire} from 'node:module';
import {afterEach, describe, expect, it, vi} from 'vitest';

const require = createRequire(import.meta.url);
const {applyTransform} = require('jscodeshift/src/testUtils');
const transform = require('../../codemods/transforms/register-binding');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('wrap-register-rules', () => {
  it('wraps declarative rule keys into rules and keeps the rest on top', () => {
    const input = `const {register} = useForm();\n<input {...register('age', {required: true, min: 18, onChange: handleAge, valueAsNumber: true})} />;`;
    const output = applyTransform(transform, {}, input);
    // recast reprints structurally-edited objects one property per line.
    expect(output).toBe(
      'const {register} = useForm();\n' +
        "<input {...register('age', {\n" +
        '  rules: {\n' +
        '    required: true,\n' +
        '    min: 18\n' +
        '  },\n' +
        '\n' +
        '  onChange: handleAge,\n' +
        '  valueAsNumber: true\n' +
        '})} />;'
    );
  });

  it('handles form.register member calls (incl. computed) and pattern/validate', () => {
    const input = `form.register('email', {required: 'Email is required', pattern: {value: /@/, message: 'Invalid'}, validate: validateEmail, shouldUnregister: false});\nctx['register']('a', {min: 1});`;
    const output = applyTransform(transform, {}, input);
    expect(output).toBe(
      "form.register('email', {\n" +
        '  rules: {\n' +
        "    required: 'Email is required',\n" +
        "    pattern: {value: /@/, message: 'Invalid'},\n" +
        '    validate: validateEmail\n' +
        '  },\n' +
        '\n' +
        '  shouldUnregister: false\n' +
        '});\n' +
        "ctx['register']('a', {rules: {\n" +
        '  min: 1\n' +
        '}});'
    );
  });

  it('is idempotent: an existing rules key is never merged into', () => {
    const input = `form.register('email', {rules: {required: true}, onChange: fn});`;
    expect(applyTransform(transform, {}, input)).toBe(input);

    // Re-running the transform on its own output changes nothing.
    const once = applyTransform(
      transform,
      {},
      `register('age', {required: true, valueAsNumber: true});`
    );
    expect(applyTransform(transform, {}, once)).toBe(once);
  });

  it('leaves calls without a second argument (or with a non-literal one) alone', () => {
    const input = `const a = register('email');\nconst b = form.register('email', options);`;
    expect(applyTransform(transform, {}, input)).toBe(input);
  });

  it('leaves non-target calls alone', () => {
    const input = `registerComponent('x', {required: true});\nuseForm({defaultValues: {}});\nsw.register('/sw.js', {scope: '/'});`;
    expect(applyTransform(transform, {}, input)).toBe(input);
  });

  it('conservatively skips options containing a spread element, with a report', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const input = `register('x', {...opts, required: true});`;
    expect(applyTransform(transform, {}, input)).toBe(input);
    expect(info.mock.calls.flat().join('\n')).toContain('spread');
  });

  it('leaves empty options objects alone', () => {
    const input = `register('x', {});`;
    expect(applyTransform(transform, {}, input)).toBe(input);
  });
});
