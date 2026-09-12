import {createRequire} from 'node:module';
import {afterEach, describe, expect, it, vi} from 'vitest';

const require = createRequire(import.meta.url);
const {applyTransform} = require('jscodeshift/src/testUtils');
const transform = require('../../codemods/transforms/use-form-options');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rename-use-form-options', () => {
  it('renames defaultValues to initialValues and keeps same-name options', () => {
    const input = `const {register} = useForm({defaultValues: {email: ''}, mode: 'onBlur', reValidateMode: 'onChange', shouldUnregister: true, delayError: 500});`;
    const output = applyTransform(transform, {}, input);
    // Key-only mutation: recast patches in place, formatting untouched.
    expect(output).toBe(
      `const {register} = useForm({initialValues: {email: ''}, mode: 'onBlur', reValidateMode: 'onChange', shouldUnregister: true, delayError: 500});`
    );
  });

  it('removes criteriaMode/progressive/resolver and reports each via console.info', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const input = `useForm({defaultValues: {}, mode: 'onBlur', resolver: zodResolver(schema), criteriaMode: 'all', progressive: true});`;
    const output = applyTransform(transform, {}, input);
    expect(output).toBe(
      "useForm({\n  initialValues: {},\n  mode: 'onBlur'\n});"
    );
    const logged = info.mock.calls.flat().join('\n');
    for (const key of ['criteriaMode', 'progressive', 'resolver']) {
      expect(logged).toContain(key);
    }
    expect(logged).toContain('standardSchemaFormValidator');
  });

  it('is idempotent: already-migrated options are untouched', () => {
    const input = `useForm({initialValues: {a: 1}, mode: 'onChange'});`;
    expect(applyTransform(transform, {}, input)).toBe(input);

    // Re-running the transform on its own output changes nothing.
    const once = applyTransform(
      transform,
      {},
      `useForm({defaultValues: {email: ''}, mode: 'onBlur'});`
    );
    expect(applyTransform(transform, {}, once)).toBe(once);
  });

  it('leaves calls without an options object alone', () => {
    const input = `const a = useForm();\nconst b = useForm(config);`;
    expect(applyTransform(transform, {}, input)).toBe(input);
  });

  it('leaves non-target calls alone', () => {
    const input = `const c = useOtherForm({defaultValues: {}});\nfoo.useForm({defaultValues: {}});`;
    expect(applyTransform(transform, {}, input)).toBe(input);
  });

  it('expands the defaultValues shorthand instead of rebinding it', () => {
    const input = `useForm({defaultValues});`;
    expect(applyTransform(transform, {}, input)).toBe(
      `useForm({initialValues: defaultValues});`
    );
  });

  it('does not create a duplicate key when initialValues already exists', () => {
    const input = `useForm({defaultValues: fallback, initialValues: {a: 1}});`;
    expect(applyTransform(transform, {}, input)).toBe(input);
  });

  it('renames alongside spread elements (named keys stay addressable)', () => {
    const input = `useForm({...baseConfig, defaultValues: {a: 1}, mode: 'onBlur'});`;
    expect(applyTransform(transform, {}, input)).toBe(
      `useForm({...baseConfig, initialValues: {a: 1}, mode: 'onBlur'});`
    );
  });
});
