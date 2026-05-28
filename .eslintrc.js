module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    commonjs: true,
    es6: true
  },
  globals: {
    __DEV__: true
  },
  parser: '@typescript-eslint/parser',
  plugins: ['prettier', 'builtin-compat', '@typescript-eslint'],
  extends: [
    'airbnb',
    'airbnb/hooks',
    'eslint-config-prettier',
    'plugin:storybook/recommended'
  ],
  settings: {
    'builtin-compat-ignore': [],
    'import/resolver': {
      typescript: {},
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx']
      }
    }
  },
  rules: {
    'builtin-compat/no-incompatible-builtins': 'error',
    'prettier/prettier': 'error',
    'react/jsx-props-no-spreading': 'off',
    'react/prop-types': 'off',
    'react-hooks/exhaustive-deps': 'warn',
    'consistent-return': [
      'error',
      {
        treatUndefinedAsUnspecified: true
      }
    ],
    'no-return-assign': ['error', 'except-parens'],
    'no-shadow': 'off',
    'no-param-reassign': 'off',
    'no-plusplus': 'off',
    'no-multi-assign': 'off',
    'no-use-before-define': [
      'error',
      {
        functions: false
      }
    ],
    'no-underscore-dangle': 'off',
    'no-void': 'off',
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'import/prefer-default-export': 'off',
    'consistent-return': 'off',
    'no-promise-executor-return': 'off',
    'react/require-default-props': 'off',
    'react/jsx-filename-extension': ['error', {extensions: ['.jsx', '.tsx']}],
    'no-redeclare': 'off', // TS handles this
    'no-restricted-syntax': 'off',
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        js: 'never',
        jsx: 'never',
        ts: 'never',
        tsx: 'never'
      }
    ],
    'import/no-unresolved': ['error', {ignore: ['^@']}] // ignore @-prefixed storybook paths
  },
  parserOptions: {
    parser: '@babel/eslint-parser'
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      rules: {
        'no-undef': 'off', // TS handles this
        'no-unused-vars': 'off' // use @typescript-eslint/no-unused-vars instead
      }
    }
  ]
};
