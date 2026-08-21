/**
 * Benchmark: getValues merge strategies (not part of the unit suite; run
 * with `npx vitest bench test/bench/getValues.bench.ts`).
 *
 * Compares the pre-optimization merge (per-key chained `set`, inlined here
 * unchanged as the control implementation) against the ownership-tracked
 * `setOwned` copy-on-write merge now used by getValues, at 100 fields with
 * depth-3 nesting (10 sections x 10 groups x leaf fields, so keys share
 * ancestors -- the shape the old merge re-copied per key). Also measures
 * the isDirty/getDirtyFields scan to gauge whether derived-state caching
 * would pay for itself.
 */
import {bench, describe} from 'vitest';
import createForm, {getValues, isDirty} from '../../src/form';
import type {Form} from '../../src/form';
import {set, unset} from '../../src/util';

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

describe('getValues - 100 fields, depth 3', () => {
  bench('legacy: chained set per key', () => {
    getValuesLegacy(form100x3);
  });

  bench('setOwned: copy-on-write merge', () => {
    getValues(form100x3);
  });
});

describe('isDirty scan - same form', () => {
  bench('isDirty full scan', () => {
    isDirty(form100x3);
  });
});
