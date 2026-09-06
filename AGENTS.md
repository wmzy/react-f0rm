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
- `emitter` — event emitter for reactive updates, typed with a `FormEvents` table (`change`/`errors`/`touched`/`validating` carry an optional `Path` payload, `focusError` carries `[key, options?]`, the rest are payload-less); listener cap raised to unlimited at create (`setMaxListeners(emitter, 0)`) — a form legitimately holds one listener per mounted field per event
- `validate` — optional form-level validator
- `mode: ValidationMode` / `reValidateMode: ReValidateMode` — validation timing (resolved defaults at create: `'onSubmit'` / `'onChange'`)
- `isSubmitting`, `submitCount`, `isSubmitSuccessful` — submission state

Key exports: `createForm`, `getValues`, `getValue`, `setValue` (4th `options?: SetFieldOptions` — `shouldValidate`/`shouldTouch` default false; `shouldDirty: false` commits the write: the value becomes the field's dirty baseline via a module-private `dirtyBaselines` WeakMap, cleared by reset/setInitialValues/resetField/removeField and pruned by ancestor-path writes), `getError`, `getErrors`, `getFirstError`, `setError`, `clearErrors`, `setTouched`, `hasTouched`, `isDirty`, `getDirtyFields`, `getTouchedFields`, `isTouched`, `removeField` (third `options?: RemoveFieldOptions` — `keepValue`/`keepDirty`(implies keepValue)/`keepTouched`/`keepError`, RHF `unregister` names), `setInitialValues`, `reset` (options add RHF-parity `keepValues` (every current leaf, clean baseline fields included, written back over the new baseline) and `keepDefaultValues` (ignore a provided baseline) beside `keepDirtyValues`), `trigger` (third `options?: TriggerOptions` — `shouldTouch` marks the triggered scope touched; `shouldFocus` focuses the first errored triggered field via the 'focusError' channel), `FORM_ERROR` (exported constant `'_form'`: the reserved top-level segment for form-level errors — the Standard Schema form validator's landing slot for path-less issues; read it via `getError(form, FORM_ERROR)`/`setError(form, FORM_ERROR, …)` instead of the magic string), `ensureValidate`, `validate`, `handleSubmit` (headless submit handler taking `{onSubmit, onValidSubmit, onInvalidSubmit, onAction, shouldFocusError}` — `onAction` runs last with the final values; `<Form>`'s `action` prop uses it to dispatch `formDataFromValues(values)`), `setServerErrors` (lands a server error record `Record<string, string | string[]>` as per-field `type: 'server'` errors; clears existing first unless `keepExisting`), plus types `ValidationMode` (`'onSubmit'|'onBlur'|'onChange'|'onTouched'|'all'`), `ReValidateMode` (`'onChange'|'onBlur'|'onSubmit'`, effective only while the field already has an error), `SetFieldOptions`, `HandleSubmitOptions`, `RemoveFieldOptions`, `FieldError`, `FieldErrorEntry`

`getValues` merges the values Map over `initialValues` with copy-on-write ownership tracking (`setOwned` in util.ts): each distinct container on a written path is allocated once and shared by all paths through it, then removes tombstoned paths immutably (`unset`). Memoized per form through a module-level `valuesCaches` WeakMap (the same version-bump/read pattern `getDirtyFields` uses): every value-mutating entry point (setValueByPath, removeFieldByPath, setInitialValues, reset, resetField, setParsedValues) bumps a version counter, so consecutive reads share one reference — the result is read-only shared between writes.

Generation semantics of whole-branch writes: `setValueByPath` at a path P drops the values Map keys under P (they belong to a replaced generation — they would shadow the new value on exact-key reads or re-apply over it in `getValues`' insertion-ordered merge), and `getValueByPath` resolves a missing key through the nearest live ancestor entry before falling back to `parsedValues ?? initialValues` — so leaf readers (`useField` at `items[0].name`) follow a wholesale replace (`setValue(form, 'items', …)`, every `useFieldArray` operation) instead of seeing the pre-edit snapshot. Paths the ancestor's value does not carry read `undefined`; the baseline never fills holes inside a replaced branch. `set`/`setOwned` copy with the array rule for numeric segments in either form (numbers from bracket syntax, or index-shaped strings from programmatic segment arrays), so merging into an array branch keeps it an array.

`getDirtyFields` is memoized per form through a module-level `dirtyFieldsCaches: WeakMap<Form, DirtyFieldsCache>`: `setValue`/`reset` etc. bump a `version` counter (mutation since last compute) while reads reset it and cache the result — a non-zero version means stale, so the next read recomputes.

### Path System (`src/path.ts`, `src/util.ts`, `src/types.ts`)
- `src/path.ts` — `create(name)` returns a `Path` `{value: segments, key: JSON-stringified segments}`; `key` is the Map/Set lookup key
- `src/util.ts` — `parsePath` tokenizer accepts dotted (`a.b`), bracket (`a[0]`, `a["b c"]`, `a['b']`) syntax; numeric segments are bracket-only (`items.0` throws a `TypeError` suggesting `items[0]`), and a quoted segment (`items["0"]`) keeps an explicit string key. `normalizePath` caches parsed strings in a module-level `pathCache` Map (throwing paths are never cached); the cache is FIFO-bounded at 1e4 entries — a backstop for dynamic keys only, since eviction just costs a re-parse and never changes behavior. Also `get`/`set`/`unset`/`setOwned` immutable tree helpers
- `src/types.ts` — compile-time path types: `FieldPath<T>` enumerates valid path strings for a values shape, `PathValue<T, P>` resolves the value type at a path; includes self-check types verified by `tsc --noEmit`

### Hooks Layer (`src/hooks/`)
- `useForm` — creates the form instance via `useState` lazy initialization (stable across re-renders and StrictMode double renders), syncs `initialValues` through `setInitialValues` in an effect; an extra `values` option enables controlled usage — changed content re-syncs (setInitialValues semantics: uncommitted edits discarded, touched/errors kept) while equal content never re-syncs (structural comparison, so inline literals per render never clobber typing)
- `useField` — combines value, error (`error`: message string, `errorObject`: `FieldError`), touch state + onChange/onBlur handlers; validates per `form.mode`/`form.reValidateMode` (`reValidateMode` only while the field already has an error); returns the bound `form` for direct headless access; accepts an explicit `form` option (no Provider needed); `uncontrolled: true` pins the value at mount and skips the value subscription — typing re-renders nothing (RHF `register`-style; the store still carries every write, errors/touched/disabled/validating still re-render the field; reset/initialValues do not push into the pinned snapshot or the DOM); `validateDeps` declares field-to-field linkage — listed paths' user changes re-run this field's validator through `revalidateDependentsOnChange` (per-form `fieldValidateDeps` WeakMap registry, same mode matrix as the form-level option); `initialValue` seeds during render (`seedValueByPath` — an emit-free write) so the first paint and SSR carry it, with a post-commit `emitChangeByPath` announce per actual seed; the result carries `focusRef` — an identity-stable callback ref subscribing to the `'focusError'` event from inside `useFieldCore` (headless `setFocus`/failed-submit auto-focus channel; `<Field>` just forwards it through its merged ref, it no longer owns its own subscription)
- `useFieldArray` — array field operations (append/prepend/insert/remove/swap/move); subscribes to `change` events with path-prefix filtering so only changes touching its branch re-render it
- `useFieldArrayItem` — per-row subscription for large arrays (TanStack field-api counterpart): resolves a row by its stable `id` through a module-level `arrayIdsRegistry` WeakMap (the paired `useFieldArray` publishes its live ids array there — render-time for SSR, re-registered in the effect because StrictMode exercises the cleanup path without a fresh render); index+value are read synchronously at render from the array layer and re-validated in the listener (a render is dispatched only when the row's own index or value reference changed — React's equal-state bailout is not honored under act), errors subscribe to the exact row key. Single-row edits re-render only that row; index migrations (reorder/remove) re-render by design
- `useValidate` — registers the field validator in `form.validators`, with a lock guarding stale async results
- `useWatch` — built on `use-sync-external-store/shim` (tearing-safe, React ≥ 16.8); caches the getter snapshot per hook instance and invalidates it on the watched event; optional 4th `isEqual` argument (TanStack `useSelector` compare contract) recomputes on event and skips `notify()` entirely while the projection is equal — broad-scope custom getters returning fresh-but-equal references stop re-rendering
- `useValue`, `useError`, `useTouched`, `useIsDirty`, `useDirtyFields`, `useTouchedFields`, `useHasErrors`, `useIsValid` (`!hasErrors`, RHF `isValid` semantics — in-flight validation does not flip it), `useIsSubmitting`, `useSubmitCount`, `useIsValidating` (`form.validating.size > 0`: field async/debounce windows plus the form-level round), `useIsSubmitSuccessful`, `useFormError`/`useFormErrors` (read the `FORM_ERROR` key), `useFormState` (one subscription, one reference-stable aggregate snapshot: isDirty/dirtyFields/isTouched/touchedFields/hasErrors/isValid/isSubmitting/isValidating/isSubmitSuccessful/submitCount/disabled; field-wise comparator skips re-renders while nothing observably changed), `useCanSubmit` — state hooks built on `useWatch`

### Components (`src/components/`)
- `Form` — context provider, handles submission/validation flow with submission state tracking; native constraint validation gates submission (`checkValidity()` before custom validators, `reportValidity()` bubbles on failure; the element renders `noValidate`); accepts `values` for controlled external sync, `shouldFocusError` (default true) and an `action` prop — after validation passes (and after onSubmit/onValidSubmit), the validated values are converted to `FormData` (`formDataFromValues`) and dispatched to it, e.g. a React 19 Server Action
- `FormField` — headless render-prop counterpart of `useField` (`{children: field => …}`, Formik `<Field>` shape) for class components and library bridges
- `Field` — controlled input; `type="file"` inputs are special-cased: no `value` prop ever (files cannot be value-controlled), the picked `FileList` is written into the form store so getValues/submit/validation carry it; `uncontrolled` renders `defaultValue` instead of `value`; on error sets `aria-invalid` and appends `fieldErrorId(name)` to `aria-describedby` (exported `fieldErrorId` is the library-wide convention: any error element rendering that id completes the screen-reader chain); with the `renderError(error, id)` prop renders `<span id role="alert">` itself; user-provided `aria-describedby` is preserved (error id appended after); mirrors custom errors onto native validity via `setCustomValidity`; subscribes to the form's `'focusError'` event to focus its input when a failed submit names it as the first error
- `Checkbox`, `Radio` (`Group`/`Item`) — group/item components for multi-select and single-select
- `Select` — controlled `<select>` with options as children; single-select stores a string value, `multiple` stores the selected options' values as a string array

### Context (`src/context.ts`)
`FormContext` provides the form instance to nested components via `useFormContext()`.

### Subscriptions (`src/subscribe.ts`)
Path-scoped event subscription primitives — the reason a keystroke stays O(affected fields) instead of O(all subscribers):
- `onPathEvent(emitter, event, path, scope, cb)` — `leaf` scope fires for writes at the path itself or an ancestor; `branch` scope additionally fires for descendants (array sections). Payload-less emits (reset, setInitialValues) always fire — the correctness fallback.
- `onKeyEvent(emitter, event, key, cb)` — exact-key match or payload-less; used by error/touched watches. Ancestor/descendant tests compare JSON path keys with a mandatory trailing comma so `["tagsX"]` never prefix-matches `["tags"]`.
- Emit sites that mutate a single path carry the `Path` payload (`setValueByPath`, `removeFieldByPath`, `setErrorByPath`, `setTouchedByPath`, `setValidating*`); bulk operations (reset, setInitialValues, clear-all) emit payload-less so every subscriber resyncs. The public `subscribe` event union is `'change' | 'errors' | 'touched' | 'validating' | 'submitting' | 'submitCount' | 'submitSuccessful' | 'disabled'` — `'validating'` carries paths (routed like `'change'`), the rest of the tail is payload-less broadcasts; routing is a blacklist (`errors`/`touched` → `onKeyEvent`, everything else → `onPathEvent`).

### Resolvers (`src/resolvers/`)
Schema validation adapters (tree-shakeable, separate entry points):
- `standard-schema` — one adapter for any Standard Schema v1 implementation (zod v3.24+/v4, valibot v1, arktype): `standardSchemaResolver` (field-level) and `standardSchemaFormValidator` (form-level; issues without a path land on the `FORM_ERROR` key)
- `zodResolver` — adapts Zod schemas
- `yupResolver` — adapts Yup schemas

### Server entry (`src/server.ts`)
`react-f0rm/server` — tree-shakeable entry importing only from `./form` (zero React in the module graph, RSC/Server Action safe): `validateValues(values, options?)` runs one whole-form validation round over a plain payload (`createForm` + `trigger`, never rejects) and returns `{valid, values, errors}` where `values` carries schema-coerced output (the `parsedValues` baseline) and `errors` is the flat `FieldErrorEntry[]` list; `formDataFromValues(values)` converts a values tree into `FormData` (arrays → multiple entries, File/FileList passthrough, Date → ISO string, objects → JSON, null/undefined skipped) — the converter `<Form action>` uses to dispatch React 19 Server Actions; re-exports `VALIDATION_OUTCOME`/`ValidationOutcome` so branded outcomes can be built server-side.

### Persistence entry (`src/persist.ts`)
`react-f0rm/persist` — React-free side entry: `persistForm(form, {key, storage?, serialize?, deserialize?})` hydrates a stored snapshot via `setInitialValues` (restored values become the clean baseline) and re-writes `getValues()` on every 'change' event through `subscribe`; defaults to `window.localStorage`, silently no-ops without storage (SSR), swallows corrupted payloads. Returns the unsubscribe function.

### Devtools (`src/devtools/`)
`<Devtools form? position? />` — live state panel (values/errors/touched/dirty tabs, submit status, Reset & Validate actions) shipped behind its own tree-shakeable entry `react-f0rm/devtools` (never imported by the main entry). Zero runtime dependencies: styles are injected once via an idempotent `<style>` element; data flows through the same public hooks/`useWatch` aggregates. Collapses to a corner badge (red dot when errors exist).

## Testing

Tests use Vitest with jsdom environment. Test files are in test/ directory with `.test.{ts,tsx,js,jsx}` extension. Benchmarks live in `test/bench/*.bench.ts`, run with `npx vitest bench --run …`: vitest 5 removed the top-level `bench` import — benches register through the test-context fixture inside a regular `test()` (`await bench(name, fn).run({time, warmupTime})`); `vitest bench` discovers `*.bench.*` files itself, they are NOT part of the unit-suite include.

## Key Patterns

- All form operations are pure functions — hooks add React reactivity via event subscriptions
- Path objects enable efficient Map-based lookups instead of deep object traversal; `usePath` memoizes with a two-layer `useMemo` keyed on `path.key` so fresh name arrays reuse the cached Path object
- Validation is async via `ensureValidate`/`validate` with event-driven completion tracking
- Validation timing is governed by `mode`/`reValidateMode` (useField's onChange/onBlur guards): mode `'onTouched'` validates on first blur then on every change; `reValidateMode` supplements any mode but only while the field currently has an error
- `ensureValidate` runs field-level validators first, then form-level `validate` if provided; its result is flattened recursively (nested objects descend into deeper paths)
- `setError` accepts `string | FieldError | undefined`; strings are normalized to `{type: 'custom', message}`
- `useField` unregisters on unmount by default, leaving a tombstone so the value does not fall back to `initialValues`; pass `shouldUnregister: false` to preserve the value instead
