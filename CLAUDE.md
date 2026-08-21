# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

react-f0rm is a lightweight React form library focused on:
- Event-driven architecture using `@for-fun/event-emitter`
- Field-level subscriptions — a change re-renders only the affected field
- Fine-grained tree-shaking (only pay for features you use, e.g. resolvers are separate entry points)
- Map/Set-based state storage for efficient updates
- TypeScript source with full type coverage

## Common Commands

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:ui       # Vitest UI
npm run coverage      # Coverage report
npx vitest bench --run test/bench/  # Benchmarks (render, getValues)
npm run build         # Production build (UMD + ESM + CJS)
npm run lint          # ESLint
npm run lint:fix      # ESLint auto-fix
npm run storybook     # Storybook dev server
```

## Architecture

### Core Layer (`src/form.ts`)
Pure functions operating on a Form state object with:
- `values: Map<string, any>` — field values keyed by JSON-serialized path
- `errors: Map<string, FieldError>` — validation errors; `FieldError` is `{type, message}` (`type: 'custom'` for plain string errors)
- `deleted: Set<string>` — tombstones of unregistered paths: reads and `getValues()` must not fall back to `initialValues` for these paths
- `touched: Set<string>` — touched field tracking
- `validators: Map<string, () => void>` — field validators
- `validating: Set<string>` — in-flight async validators
- `emitter` — event emitter for reactive updates
- `validate` — optional form-level validator
- `isSubmitting`, `submitCount`, `isSubmitSuccessful` — submission state

Key exports: `createForm`, `getValues`, `getValue`, `setValue`, `getError`, `getErrors`, `getFirstError`, `setError`, `clearErrors`, `setTouched`, `hasTouched`, `isDirty`, `getDirtyFields`, `getTouchedFields`, `isTouched`, `removeField`, `setInitialValues`, `reset`, `trigger`, `ensureValidate`, `validate`

`getValues` merges the values Map over `initialValues` with copy-on-write ownership tracking (`setOwned` in util.ts): each distinct container on a written path is allocated once and shared by all paths through it, then removes tombstoned paths immutably (`unset`).

### Path System (`src/path.ts`, `src/util.ts`, `src/types.ts`)
- `src/path.ts` — `create(name)` returns a `Path` `{value: segments, key: JSON-stringified segments}`; `key` is the Map/Set lookup key
- `src/util.ts` — `parsePath` tokenizer accepts dotted (`a.b`), bracket (`a[0]`, `a["b c"]`, `a['b']`) syntax; `normalizePath` caches parsed strings in a module-level `pathCache` Map. Also `get`/`set`/`unset`/`setOwned` immutable tree helpers
- `src/types.ts` — compile-time path types: `FieldPath<T>` enumerates valid path strings for a values shape, `PathValue<T, P>` resolves the value type at a path; includes self-check types verified by `tsc --noEmit`

### Hooks Layer (`src/hooks/`)
- `useForm` — creates the form instance via `useState` lazy initialization (stable across re-renders and StrictMode double renders), syncs `initialValues` through `setInitialValues` in an effect
- `useField` — combines value, error (`error`: message string, `errorObject`: `FieldError`), touch state + onChange/onBlur handlers; accepts an explicit `form` option (no Provider needed)
- `useFieldArray` — array field operations (append/prepend/insert/remove/swap/move); subscribes to `change` events with path-prefix filtering so only changes touching its branch re-render it
- `useValidate` — registers the field validator in `form.validators`, with a lock guarding stale async results
- `useWatch` — built on `use-sync-external-store/shim` (tearing-safe, React ≥ 16.8); caches the getter snapshot per hook instance and invalidates it on the watched event
- `useValue`, `useError`, `useTouched`, `useIsDirty`, `useDirtyFields`, `useTouchedFields`, `useHasErrors`, `useIsSubmitting`, `useSubmitCount` — state hooks built on `useWatch`

### Components (`src/components/`)
- `Form` — context provider, handles submission/validation flow with submission state tracking; native constraint validation gates submission (`checkValidity()` before custom validators, `reportValidity()` bubbles on failure; the element renders `noValidate`)
- `Field` — controlled input; sets `aria-invalid` on error, and with the `renderError(error, id)` prop renders `<span id role="alert">` and wires `aria-describedby`; mirrors custom errors onto native validity via `setCustomValidity`
- `Checkbox`, `Radio` (`Group`/`Item`) — group/item components for multi-select and single-select

### Context (`src/context.ts`)
`FormContext` provides the form instance to nested components via `useFormContext()`.

### Resolvers (`src/resolvers/`)
Schema validation adapters (tree-shakeable, separate entry points):
- `standard-schema` — one adapter for any Standard Schema v1 implementation (zod v3.24+/v4, valibot v1, arktype): `standardSchemaResolver` (field-level) and `standardSchemaFormValidator` (form-level; issues without a path land on the `_form` key)
- `zodResolver` — adapts Zod schemas
- `yupResolver` — adapts Yup schemas

## Testing

Tests use Vitest with jsdom environment. Test files are in `test/` directory with `.test.{ts,tsx,js,jsx}` extension. 216 tests across 14 files (per `npx vitest list`). Benchmarks live in `test/bench/*.bench.ts`.

## Key Patterns

- All form operations are pure functions — hooks add React reactivity via event subscriptions
- Path objects enable efficient Map-based lookups instead of deep object traversal; `usePath` memoizes with a two-layer `useMemo` keyed on `path.key` so fresh name arrays reuse the cached Path object
- Validation is async via `ensureValidate`/`validate` with event-driven completion tracking
- `ensureValidate` runs field-level validators first, then form-level `validate` if provided; its result is flattened recursively (nested objects descend into deeper paths)
- `setError` accepts `string | FieldError | undefined`; strings are normalized to `{type: 'custom', message}`
- `useField` unregisters on unmount by default, leaving a tombstone so the value does not fall back to `initialValues`; pass `shouldUnregister: false` to preserve the value instead
