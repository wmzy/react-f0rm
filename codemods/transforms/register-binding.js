'use strict';

/**
 * wrap-register-rules — move React Hook Form's declarative `register(name,
 * options)` rules into react-f0rm's `rules` key.
 *
 * react-f0rm's `register` (both `register(...)` from a destructured RHF
 * `useForm()` and the instance method `form.register(...)`) takes the same
 * second-argument object, but the declarative rules live one level deeper:
 *
 *   register('age', {required: true, min: 18, valueAsNumber: true})
 *   →  register('age', {rules: {required: true, min: 18}, valueAsNumber: true})
 *
 * Wrapped into `rules` (the `FieldRules` keys): `required`, `min`, `max`,
 * `minLength`, `maxLength`, `pattern`, `validate`. They keep their relative
 * order, and the `rules` object takes the position of the first one.
 *
 * Left at the top level: everything else — `onChange`, `onBlur`,
 * `shouldUnregister`, `disabled`, `setValueAs`, … and notably
 * `valueAsNumber`/`valueAsDate`, which are already top-level react-f0rm
 * `RegisterOptions` keys (wrapping them would disable the coercion).
 *
 * Conservatively skipped (no rewrite, no report unless noted):
 * - no second argument, or the second argument is not an object literal
 * - an empty options object
 * - a `rules` key already present (idempotent; re-runs are no-ops)
 * - any spread element in the options object (logged via `console.info`)
 *
 * The `useForm()` destructuring itself (`const {register} = useForm()`) is
 * NOT touched — react-f0rm returns the form instance, see the manual steps
 * in codemods/README.md.
 *
 * Usage: npx jscodeshift -t codemods/transforms/register-binding.js <files>
 *
 * @param {import('jscodeshift').FileInfo} file
 * @param {import('jscodeshift').API} api
 * @returns {string} the printed source
 */
module.exports = function wrapRegisterRules(file, api) {
  const j = api.jscodeshift;
  const source = typeof file === 'string' ? file : file.source;
  const where = typeof file === 'string' ? '(inline)' : file.path || '(unknown)';
  const root = j(source);

  root.find(j.CallExpression).forEach(path => {
    const call = path.value;
    if (!isRegisterCallee(call.callee)) return;
    const options = call.arguments[1];
    if (!options || options.type !== 'ObjectExpression') return;

    if (options.properties.some(prop => !isObjectProperty(prop))) {
      console.info(
        `[wrap-register-rules] ${where}: left a register() call untouched — its options contain a spread element; move the rule keys into \`rules\` by hand`
      );
      return;
    }
    // Already migrated — never merge into an existing `rules`.
    if (options.properties.some(prop => keyName(prop) === 'rules')) return;

    const ruleProps = options.properties.filter(prop =>
      RULE_KEYS.has(keyName(prop))
    );
    if (ruleProps.length === 0) return;

    const makeProperty = j.objectProperty
      ? (key, value) => j.objectProperty(key, value)
      : (key, value) => j.property('init', key, value);
    const rulesProp = makeProperty(
      j.identifier('rules'),
      j.objectExpression(ruleProps)
    );
    const next = [];
    let placed = false;
    for (const prop of options.properties) {
      if (RULE_KEYS.has(keyName(prop))) {
        if (!placed) {
          next.push(rulesProp);
          placed = true;
        }
        continue;
      }
      next.push(prop);
    }
    options.properties = next;
  });

  return root.toSource();
};

/** react-f0rm `FieldRules` keys — the declarative rules RHF accepts inline
 * on register(), all valid inside react-f0rm's `rules`. */
const RULE_KEYS = new Set([
  'required',
  'min',
  'max',
  'minLength',
  'maxLength',
  'pattern',
  'validate'
]);

/** `register(...)` (destructured RHF binding) and `<anything>.register(...)`
 * (`form.register`, `props.form.register`, computed `['register']`). */
function isRegisterCallee(callee) {
  if (callee.type === 'Identifier') return callee.name === 'register';
  if (callee.type !== 'MemberExpression') return false;
  const property = callee.property;
  if (!callee.computed) {
    return property.type === 'Identifier' && property.name === 'register';
  }
  return (
    (property.type === 'StringLiteral' || property.type === 'Literal') &&
    property.value === 'register'
  );
}

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
