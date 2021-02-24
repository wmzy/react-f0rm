module.exports = {
  env: {
    mocha: true
  },
  plugins: ['mocha'],
  rules: {
    'builtin-compat/no-incompatible-builtins': 'off',
    'func-names': 'off'
  }
};
