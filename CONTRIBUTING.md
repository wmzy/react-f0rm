# Contributing

Thanks for wanting to help. This file is the fast path: setup, conventions,
and the definition of done for a PR.

## Setup

```sh
pnpm install
```

Node 24, pnpm 11 (the repo pins it via `packageManager`).

## Commands

| Command | What it does |
|---|---|
| `npm test` | Full unit suite (vitest, jsdom, `vmThreads` pool) |
| `npm run test:watch` | Watch mode |
| `npm run coverage` | Coverage report |
| `npm run lint` / `npm run lint:fix` | ESLint / auto-fix |
| `npx tsc --noEmit` | Type check (vitest transpiles without it — run this, CI does) |
| `npm run build` | Production build (UMD + ESM + CJS + d.ts) |
| `npx vitest bench --run test/bench/` | Benchmarks — run **alone**, never alongside the unit suite (they inflate each other's timings) |
| `npm run storybook` | Component gallery |
| `npm run size` | size-limit bundle check |

CI (`.github/workflows/ci.yml`) runs lint → build → test → tsc, plus
size-limit on PRs. A PR is green when all four pass locally.

## Architecture

- `src/form.ts` — the facade: public types, the `create` factory, and
  `export *` of the implementation modules. `src/core/` is split by
  concern (`values`, `errors`, `touched`, `dirty`, `validate`, `change`,
  `submit`, `focus`); `src/core/internals.ts` is module-private shared
  state and is deliberately **never** re-exported.
- `src/hooks/` — the React layer (`useForm`, `useField`, `useFieldArray`,
  `useValidate`, `useTransform`, `useWatch` + the path-scoped readers).
  All state transitions live in the core; hooks subscribe to events.
- `src/components/` — bound components (`Form`, `Field`, `Checkbox`,
  `Select`, `Radio`/`Checkbox` groups, `FormField`).
- `src/emitter.ts` — a verbatim re-export of `@for-fun/event-emitter`
  (shared runtime dependency, kept **external** in ESM/CJS builds). Do
  not vendor it back in — that decision was made deliberately and
  reverted once.
- `src/resolvers/`, `src/server.ts`, `src/persist.ts`, `src/devtools/` —
  separate tree-shakeable entry points; the main entry never imports them.

The dependency graph is acyclic. When adding an event, update the
`FormEvents` table in `src/form.ts` first — subscribers' callback
signatures are type-checked against it.

## Conventions

- **Tests live next to behavior**: one file per `src/core` concern under
  `test/core/`, one per hook/component under `test/hooks/` and
  `test/components/`. No shared module-level helpers between test files.
- Tests assert **observable behavior** — state reads, rendered output,
  events — never implementation details (wiring, field copies, mocks
  echoing back).
- Path-scoped subscriptions use `path.key` as the effect dep (with the
  eslint-disable comment), not the Path object — `usePath` memoizes per
  key.
- DEV-only branches use the `__DEV__` flag (replaced at build time,
  defined in `vitest.config.ts` for tests).
- Commit messages follow commitizen (`npm run commit`).

## Definition of done

- [ ] Behavior change has a regression test that fails without the change
      (or a smoke test where one cannot be added cheaply — say which).
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass.
- [ ] Public API changes are documented: README + `docs-site/docs/` +
      `AGENTS.md` where the architecture notes live.
- [ ] No second convention introduced beside an existing one — reuse the
      pattern already in the codebase.

## Release

semantic-release (`.releaserc.json`) publishes on push to `main`;
commitizen messages drive the version. Docs deploy separately
(`.github/workflows/deploy-docs.yml`) to https://wmzy.github.io/react-f0rm/.
