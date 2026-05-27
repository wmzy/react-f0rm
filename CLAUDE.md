# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

react-f0rm is a lightweight React form library focused on:
- Event-driven architecture using `@for-fun/event-emitter`
- Fine-grained tree-shaking (only pay for features you use)
- Map/Set-based state storage for efficient updates
- TypeScript source with full type coverage

## Common Commands

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:ui       # Vitest UI
npm run coverage      # Coverage report
npm run build         # Production build (UMD + ESM + CJS)
npm run lint          # ESLint
npm run lint:fix      # ESLint auto-fix
npm run storybook     # Storybook dev server
```

## Architecture

### Core Layer (`src/form.ts`)
Pure functions operating on a Form state object with:
- `values: Map<string, any>` — field values keyed by JSON-serialized path
- `errors: Map<string, string>` — validation errors
- `touched: Set<string>` — touched field tracking
- `validators: Map<string, () => void>` — field validators
- `emitter` — event emitter for reactive updates
- `isSubmitting`, `submitCount`, `isSubmitSuccessful` — submission state

Key exports: `createForm`, `setValue`, `getValue`, `setError`, `validate`, `reset`, `isDirty`, `isTouched`

### Path System (`src/path.ts`)
Converts field names (strings or arrays) to Path objects with:
- `key`: JSON-serialized string for Map/Set lookups
- `value`: original array for object traversal

### Hooks Layer (`src/hooks/`)
- `useForm` — creates/holds form instance via useRef
- `useField` — combines value, error, touch state + onChange/onBlur handlers; supports `shouldUnregister`
- `useFieldArray` — array field operations (append/prepend/insert/remove/swap/move)
- `useWatch` — subscribes to form events and re-renders on changes
- `useIsSubmitting`, `useSubmitCount` — submission state hooks

### Components (`src/components/`)
- `Form` — context provider, handles submission/validation flow with submission state tracking
- `Field` — controlled input with built-in HTML5 validation support
- `Checkbox`, `Radio` — group/item components for multi-select and single-select

### Context (`src/context.ts`)
`FormContext` provides form instance to nested components via `useFormContext()`.

### Resolvers (`src/resolvers/`)
Schema validation adapters (tree-shakeable, separate entry points):
- `zodResolver` — adapts Zod schemas
- `yupResolver` — adapts Yup schemas

## Testing

Tests use Vitest with jsdom environment. Test files are in `test/` directory with `.test.{ts,tsx,js,jsx}` extension. 102 tests across 11 files.

## Key Patterns

- All form operations are pure functions — hooks add React reactivity via event subscriptions
- Path objects enable efficient Map-based lookups instead of deep object traversal
- Validation is async via `ensureValidate`/`validate` with event-driven completion tracking
- `ensureValidate` runs field-level validators first, then form-level `validate` if provided
- `useField` defaults to preserving values on unmount (`shouldUnregister: false`)
