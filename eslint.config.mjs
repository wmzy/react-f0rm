import js from '@eslint/js';
import tseslintParser from '@typescript-eslint/parser';
import tseslintPlugin from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettierFlat from 'eslint-config-prettier/flat';
import builtinCompat from 'eslint-plugin-builtin-compat';
import storybook from 'eslint-plugin-storybook';
import globals from 'globals';

export default [
  // 原 .eslintignore
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'docs-site/**',
      'stories/**',
      '*.config.js'
    ]
  },
  js.configs.recommended,
  react.configs.flat.recommended,
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  importPlugin.flatConfigs.recommended,
  prettierFlat,
  ...storybook.configs['flat/recommended'],
  // 全局 React 版本设置，供 react.configs.flat.recommended 等使用
  {
    settings: {
      react: {
        version: '19.0'
      }
    }
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}', 'test/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      prettier: prettierPlugin,
      'builtin-compat': builtinCompat,
      '@typescript-eslint': tseslintPlugin
    },
    languageOptions: {
      parser: tseslintParser,
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.commonjs,
        __DEV__: 'readonly'
      }
    },
    settings: {
      'builtin-compat-ignore': [],
      react: {
        // 不用 'detect'：插件 7.37 的 detect 在 ESLint 10（context.getFilename
        // 已移除）下崩溃；直接固定版本，React 19 行为一致。
        version: '19.0'
      },
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
      // 解构排除 context 字段防止泄漏到 DOM props（Checkbox/Radio），
      // ignoreRestSiblings 是该模式的标准豁免（airbnb 同款配置）。
      'no-unused-vars': [
        'error',
        {vars: 'all', args: 'after-used', ignoreRestSiblings: true}
      ],
      'react/display-name': 'off', // React 19：forwardRef 具名赋值（Field 等）均为误报
      'react/jsx-props-no-spreading': 'off',
      'react/prop-types': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      // latest-ref（ref.current = value）是本库订阅优化的基石模式，
      // react-hooks 7 的 compiler 规则将其判为渲染期副作用——架构性豁免。
      'react-hooks/refs': 'off',
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
      'no-promise-executor-return': 'off',
      'react/require-default-props': 'off',
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
      'import/no-unresolved': ['error', { ignore: ['^@'] }] // ignore @-prefixed storybook paths
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tseslintPlugin
    },
    rules: {
      'no-undef': 'off', // TS handles this
      'no-unused-vars': 'off', // use @typescript-eslint/no-unused-vars instead
      '@typescript-eslint/no-unused-vars': [
        'error',
        {vars: 'all', args: 'after-used', ignoreRestSiblings: true}
      ]
    }
  },
  // 根配置工具文件：import 解析不可靠（vitest/config 等）
  {
    files: ['*.config.{js,ts}', 'rollup.config.js'],
    rules: {
      'import/no-unresolved': 'off'
    }
  },
  // 类型测试：类型仅出现在类型位置是 tsd 式断言的常态
  {
    files: ['test/types.test-d.tsx'],
    plugins: {
      '@typescript-eslint': tseslintPlugin
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },
  // 原 test/.eslintrc.js
  {
    files: ['test/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: { ...globals.jest }
    },
    rules: {
      'builtin-compat/no-incompatible-builtins': 'off',
      'func-names': 'off',
      // 测试惯用法：渲染期 formRef = form 捕获 form 实例
      'react-hooks/globals': 'off'
    }
  }
];
