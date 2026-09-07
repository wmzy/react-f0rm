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
import {test} from 'vitest';
import createForm, {getValues, isDirty} from '../../src/form';
import type {Form} from '../../src/form';
import {bumpValuesVersion} from '../../src/core/internals';
import {freezeValues, set, unset} from '../../src/util';

/** Pre-optimization getValues, copied verbatim as the control. */
function getValuesLegacy(form: Form): any {
  const {initialValues, values, deleted} = form;
  let merged = Array.from(values.keys()).reduce(
    (v, k) => set(v, JSON.parse(k), values.get(k)),
    initialValues
  );
  for (const key of deleted) {
    merged = unset(merged, JSON.parse(key));
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

test('getValues - 100 fields, depth 3', async ({bench}) => {
  // Local aliases: the module runner instruments re-exported bindings
  // with getters, and hot-loop access through them distorts timings.
  // Both paths compute a fresh merge per iteration: the legacy control
  // recomputes unconditionally, the owned path invalidates the per-form
  // memo first (bumpValuesVersion — test-only import, same convention as
  // pathCacheSize). Both results run through freezeValues so the DEV
  // snapshot guard (clone + freeze) is paid by both sides of the
  // comparison instead of skewing one.
  const legacy = (form: Form) => freezeValues(getValuesLegacy(form));
  const merge = (form: Form) => {
    bumpValuesVersion(form);
    return getValues(form);
  };
  await bench('legacy: chained set per key', () => {
    legacy(form100x3);
  }).run();

  await bench('setOwned: copy-on-write merge', () => {
    merge(form100x3);
  }).run();
});

test('isDirty scan - same form', async ({bench}) => {
  const scan = isDirty;
  await bench('isDirty full scan', () => {
    scan(form100x3);
  }).run();
});
