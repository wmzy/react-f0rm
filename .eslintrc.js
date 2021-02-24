module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    commonjs: true,
    es6: true
  },
  plugins: ['prettier', 'builtin-compat'],
  extends: ['airbnb', 'airbnb/hooks', 'eslint-config-prettier'],
  settings: {
    'builtin-compat-ignore': []
  },
  rules: {
    'builtin-compat/no-incompatible-builtins': 'error',
    'prettier/prettier': 'error',
    'react/jsx-props-no-spreading': 'off',
    'react/prop-types': 'off',
    'react-hooks/exhaustive-deps': 'warn',
    'no-return-assign': ['error', 'except-parens'],
    'no-shadow': 'off',
    'no-param-reassign': 'off',
    'no-plusplus': 'off',
    'no-multi-assign': 'off',
    'no-use-before-define': ['error', {functions: false}],
    'no-underscore-dangle': 'off',
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off'
  },
  parserOptions: {
    parser: 'babel-eslint'
  }
};
