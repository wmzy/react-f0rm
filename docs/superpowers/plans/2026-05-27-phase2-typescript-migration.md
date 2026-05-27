# Phase 2: TypeScript Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate all source files from JavaScript to TypeScript with strict mode.

**Architecture:** Progressive migration in dependency order. Each file gets `.ts`/`.tsx` extension, proper types, and hand-written types from `index.d.ts` get removed as we go.

**Tech Stack:** TypeScript, rollup-plugin-esbuild (replaces babel for TS compilation)

---

## File Map

| File | Action | Depends On |
|------|--------|------------|
| `tsconfig.json` | Modify | — |
| `src/util.js` → `src/util.ts` | Migrate | — |
| `src/path.js` → `src/path.ts` | Migrate | — |
| `src/context.js` → `src/context.ts` | Migrate | — |
| `src/form.js` → `src/form.ts` | Migrate | util, path |
| `src/hooks/stage.js` → `src/hooks/stage.ts` | Migrate | — |
| `src/hooks/path.js` → `src/hooks/path.ts` | Migrate | path |
| `src/hooks/form.js` → `src/hooks/form.tsx` | Migrate | form, context |
| `src/hooks/validate.js` → `src/hooks/validate.ts` | Migrate | form, context, util |
| `src/hooks/field.js` → `src/hooks/field.tsx` | Migrate | form, context, hooks |
| `src/components/Form.jsx` → `src/components/Form.tsx` | Migrate | form, context, hooks |
| `src/components/Field.jsx` → `src/components/Field.tsx` | Migrate | hooks |
| `src/components/Checkbox.jsx` → `src/components/Checkbox.tsx` | Migrate | hooks, context |
| `src/components/Radio.jsx` → `src/components/Radio.tsx` | Migrate | hooks, context |
| `src/index.js` → `src/index.ts` | Migrate | all |
| `rollup.config.js` | Modify | — |
| `index.d.ts` | Delete | — |
| `package.json` | Modify | — |

## Dependency Layers (parallelizable within each layer)

- **Layer 0:** `util.ts`, `path.ts`, `context.ts`, `hooks/stage.ts` (no internal deps)
- **Layer 1:** `form.ts` (depends on util, path)
- **Layer 2:** `hooks/path.ts`, `hooks/form.tsx` (depends on form, context)
- **Layer 3:** `hooks/validate.ts`, `hooks/field.tsx` (depends on form, hooks)
- **Layer 4:** components (depends on hooks)
- **Layer 5:** `index.ts`, rollup config, cleanup
