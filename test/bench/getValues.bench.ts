/**
 * Benchmark: getValues merge strategies (not part of the unit suite; run
 * with `npx vitest bench --run test/bench/getValues.bench.ts`).
 *
 * Compares the pre-optimization merge (per-key chained `set`, inlined here
 * unchanged as the control implementation) against the ownership-tracked
 * `setOwned` copy-on-write merge now used by getValues, at 100 fields with
 * depth-3 nesting (10 sections x 10 groups x leaf fields, so keys share
 * ancestors -- the shape the old merge re-copied per key). Also measures
 * the isDirty/getDirtyFields scan to gauge whether derived-state caching
 * would pay for itself.
 *
 * Vitest 5 benchmark API: the top-level `bench` import is gone — benches
 * register through the test-context fixture and run inside a regular
 * `test()` (`await bench(name, fn).run()`).
 */
import {test, expect} from 'vitest';
import createForm, {getValues, isDirty} from '../../src/form';
import type {Form} from '../../src/form';
import {bumpValuesVersion} from '../../src/core/internals';
import {freezeValues, set, unset} from '../../src/util';

/**
 * Pre-optimization getValues, copied verbatim as the control. The hot
 * helpers (`set`/`unset`) are injected so the control can alias them the
 * same way the bench body aliases its direct imports — the module runner
 * instruments every imported binding with a getter, and hot-loop access
 * through getters distorts timings (see the vitest "module runner
 * overhead" guidance; the residual warnings below are internal
 * cross-module calls inside `getValues`/`isDirty` themselves, which hit
 * both compared paths equally and cannot be aliased from here).
 */
function getValuesLegacy(
  form: Form,
  setFn: typeof set,
  unsetFn: typeof unset
): any {
  const {initialValues, values, deleted} = form;
  let merged = Array.from(values.keys()).reduce(
    (v, k) => setFn(v, JSON.parse(k), values.get(k)),
    initialValues
  );
  for (const key of deleted) {
    merged = unsetFn(merged, JSON.parse(key));
  }
  return merged;
}

function makeForm(fields: number, sections: number): Form {
  const form = createForm({initialValues: {}});
  for (let i = 0; i < fields; i++) {
    const path = `sec${i % sections}.grp${Math.floor(i / sections) % sections}.f${i}`;
    form.values.set(JSON.stringify(path.split('.')), `v${i}`);
  }
  return form;
}

const form100x3 = makeForm(100, 10);

/** CI regression bound, activated by BENCH_ASSERT=1 (ci.yml bench job).
 * Bounds carry ~7-8x headroom over the local 2026-09 means so shared
 * GitHub runners don't flake — they catch order-of-magnitude regressions,
 * not noise. Mean is in ms. */
const assertBound = (result: {latency: {mean: number}}, maxMs: number) => {
  if (process.env.BENCH_ASSERT) {
    expect(result.latency.mean).toBeLessThan(maxMs);
  }
};

test('getValues - 100 fields, depth 3', async ({bench}) => {
  // Local aliases: the module runner instruments imported bindings with
  // getters, and hot-loop access through them distorts timings. Both
  // paths compute a fresh merge per iteration: the legacy control
  // recomputes unconditionally, the owned path invalidates the per-form
  // memo first (bumpValuesVersion — test-only import, same convention as
  // pathCacheSize). Both results run through freezeValues so the DEV
  // snapshot guard (clone + freeze) is paid by both sides of the
  // comparison instead of skewing one.
  const getValuesLocal = getValues;
  const setLocal = set;
  const unsetLocal = unset;
  const freezeLocal = freezeValues;
  const bumpLocal = bumpValuesVersion;
  const legacy = (form: Form) =>
    freezeLocal(getValuesLegacy(form, setLocal, unsetLocal));
  const merge = (form: Form) => {
    bumpLocal(form);
    return getValuesLocal(form);
  };
  await bench('legacy: chained set per key', () => {
    legacy(form100x3);
  }).run();

  const result = await bench('setOwned: copy-on-write merge', () => {
    merge(form100x3);
  }).run();
  // Local mean 0.0556ms (2026-09); bound ~7x headroom for shared runners.
  assertBound(result, 0.4);
});

test('isDirty scan - same form', async ({bench}) => {
  const scan = isDirty;
  const result = await bench('isDirty full scan', () => {
    scan(form100x3);
  }).run();
  // Local mean 0.0391ms (2026-09); bound ~7.7x headroom for shared runners.
  assertBound(result, 0.3);
});
