// Standalone flat config for the CI compiler-smoke job (ci.yml):
// eslint-plugin-react-compiler over src/ only, no other rules. Kept
// separate from eslint.config.mjs so the main lint run stays stable while
// the compiler violations are triaged; the CI job is non-blocking
// (continue-on-error) until the codebase is compiler-clean.
import reactCompiler from 'eslint-plugin-react-compiler';
import tseslintParser from '@typescript-eslint/parser';
import tseslintPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'docs-site/**', '**/*.test.{js,jsx,ts,tsx}', 'test/**']
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        ecmaFeatures: {jsx: true}
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      'react-compiler': reactCompiler,
      // Registered for rule-name resolution only: the compiler rule reads
      // react-hooks/@typescript-eslint disable comments to decide whether
      // a component follows the rules of React.
      'react-hooks': reactHooks,
      '@typescript-eslint': tseslintPlugin
    },
    rules: {
      ...reactCompiler.configs.recommended.rules
    }
  }
];
