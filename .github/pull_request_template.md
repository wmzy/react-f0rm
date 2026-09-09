## What

<!-- One paragraph: the change, and the problem it solves. -->

## Why

<!-- The decision: why this approach over the alternatives. -->

## Verification

<!-- What was exercised: `npm test`, `npm run lint`, `npx tsc --noEmit`,
`npm run build`, benchmarks, manual browser checks. Benchmarks run alone,
never alongside the unit suite. -->

## Checklist

- [ ] Regression test fails without the change (or a smoke test — say which)
- [ ] Full suite + lint + tsc + build pass
- [ ] Public API changes documented (README / docs-site / AGENTS.md)
- [ ] No second convention introduced beside an existing one
