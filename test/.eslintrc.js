module.exports = {
  env: {
    jest: true
  },
  plugins: ['vitest'],
  rules: {
    'builtin-compat/no-incompatible-builtins': 'off',
    'func-names': 'off'
  }
};
