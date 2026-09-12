'use strict';

/**
 * rename-use-form-options — migrate `useForm()` options from React Hook Form
 * to react-f0rm.
 *
 * For every `useForm({...})` call whose first argument is an object literal:
 *
 * - `defaultValues: …` is renamed to `initialValues: …`. The shorthand
 *   `{defaultValues}` expands to `initialValues: defaultValues`. If an
 *   `initialValues` key is already present the rename is skipped, so running
 *   the transform twice is a no-op.
 * - RHF-only options with no react-f0rm counterpart are removed, each with a
 *   `console.info` line explaining what to do instead:
 *   - `criteriaMode` — react-f0rm collects every failure per field natively
 *   - `progressive`  — no counterpart
 *   - `resolver`     — react-f0rm takes the schema itself via `validate`
 * - Everything else (`mode`, `reValidateMode`, `shouldUnregister`, `values`,
 *   `disabled`, `delayError`, …) is left in place: same name and meaning in
 *   react-f0rm (`mode`/`reValidateMode`/`shouldUnregister`) or a documented
 *   manual step (`delayError` → `useField`'s `delayError`).
 *
 * Not covered (see codemods/README.md for the manual checklist): `useForm`
 * imported under an alias, non-literal option objects, and everything that
 * is not a `useForm` call.
 *
 * Usage: npx jscodeshift -t codemods/transforms/use-form-options.js <files>
 *
 * @param {import('jscodeshift').FileInfo} file
 * @param {import('jscodeshift').API} api
 * @returns {string} the printed source
 */
module.exports = function renameUseFormOptions(file, api) {
  const j = api.jscodeshift;
  const source = typeof file === 'string' ? file : file.source;
  const where = typeof file === 'string' ? '(inline)' : file.path || '(unknown)';
  const root = j(source);

  root
    .find(j.CallExpression, {
      callee: {type: 'Identifier', name: 'useForm'}
    })
    .forEach(path => {
      const options = path.value.arguments[0];
      if (!options || options.type !== 'ObjectExpression') return;

      const hasInitialValues = options.properties.some(
        prop => isObjectProperty(prop) && keyName(prop) === 'initialValues'
      );

      const kept = [];
      for (const prop of options.properties) {
        if (!isObjectProperty(prop)) {
          // Spread elements cannot be reasoned about — keep them as-is.
          kept.push(prop);
          continue;
        }
        const name = keyName(prop);
        if (name === 'defaultValues' && !hasInitialValues) {
          prop.key = j.identifier('initialValues');
          prop.computed = false;
          // `{defaultValues}` shorthand must expand, or the rename would
          // silently rebind to an `initialValues` variable.
          prop.shorthand = false;
          kept.push(prop);
          continue;
        }
        if (DROPPED_OPTIONS.has(name)) {
          console.info(
            `[rename-use-form-options] ${where}: removed \`${name}\` from useForm() — ${DROPPED_OPTIONS.get(name)}`
          );
          continue;
        }
        kept.push(prop);
      }
      options.properties = kept;
    });

  return root.toSource();
};

/** RHF useForm options with no react-f0rm counterpart: option name → what the
 * info log tells the migrator to do. */
const DROPPED_OPTIONS = new Map([
  [
    'criteriaMode',
    "react-f0rm keeps every failure per field (each is its own FieldError) — no opt-in flag; adjust error rendering if you relied on 'all'"
  ],
  [
    'progressive',
    'react-f0rm has no counterpart; validation runs per field through `validate`/`rules`'
  ],
  [
    'resolver',
    'react-f0rm takes the schema itself: `validate: standardSchemaFormValidator(schema)` from react-f0rm/resolvers/standard-schema — migrate by hand (docs-site/docs/migration/from-react-hook-form.md, "Resolver swap")'
  ]
]);

/** Object-literal property, across parser flavors (babel's `ObjectProperty`,
 * classic ast-types' `Property`). */
function isObjectProperty(prop) {
  return prop.type === 'Property' || prop.type === 'ObjectProperty';
}

/** Static name of an object-literal property key, or null when computed or
 * not a plain identifier/string key. */
function keyName(prop) {
  if (prop.computed) return null;
  const key = prop.key;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'StringLiteral' || key.type === 'Literal') {
    return typeof key.value === 'string' ? key.value : null;
  }
  return null;
}

// 'tsx' parses JS/JSX and TS/TSX, so the same transform covers every file
// type the CLI may be pointed at.
module.exports.parser = 'tsx';
