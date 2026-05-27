# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

react-f0rm is a lightweight React form library focused on:
- Event-driven architecture using `@for-fun/event-emitter`
- Fine-grained tree-shaking (only pay for features you use)
- Map/Set-based state storage for efficient updates

## Common Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run coverage

# Build for production
npm run build

# Lint
npm run lint

# Lint and fix
npm run lint:fix

# Run Storybook
npm run storybook
```

## Architecture

### Core Layer (`src/form.js`)
Pure functions operating on a form state object with:
- `values: Map<string, any>` — field values keyed by JSON-serialized path
- `errors: Map<string, string>` — validation errors
- `touched: Set<string>` — touched field tracking
- `validators: Map<string, Function>` — field validators
- `emitter` — event emitter for reactive updates

Key exports: `createForm`, `setValue`, `getValue`, `setError`, `validate`, `reset`

### Path System (`src/path.js`)
Converts field names (strings or arrays) to Path objects with:
- `key`: JSON-serialized string for Map/Set lookups
- `value`: original array for object traversal

### Hooks Layer (`src/hooks/`)
- `useForm` — creates/holds form instance via useRef
- `useField` — combines value, error, touch state + onChange/onBlur handlers
- `useWatch` — subscribes to form events and re-renders on changes

### Components (`src/components/`)
- `Form` — context provider, handles submission/validation flow
- `Field` — controlled input with built-in HTML5 validation support

### Context (`src/context.js`)
`FormContext` provides form instance to nested components via `useFormContext()`.

## Testing

Tests use Vitest with jsdom environment. Test files are in `test/` directory with `.test.{ts,tsx,js,jsx}` extension.

## Key Patterns

- All form operations are pure functions — hooks add React reactivity via event subscriptions
- Path objects enable efficient Map-based lookups instead of deep object traversal
- Validation is async via `ensureValidate`/`validate` with event-driven completion tracking
