/**
 * Benchmark: scale scenarios beyond the 100-field comfort zone (not part of
 * the unit suite; run with `npx vitest bench --run
 * test/bench/scale.bench.ts`). Three scenarios:
 *
 * Vitest 5 benchmark API: the top-level `bench` import is gone — benches
 * register through the test-context fixture and run inside a regular
 * `test()` (`await bench(name, fn).run({time, warmupTime})`).
 *
 * Scenario A "1000-field controlled form": 1000 controlled inputs mounted
 *   once via @testing-library/react (outside the timed loop), then change
 *   input #500 per iteration. The f0rm bench guards inline that exactly one
 *   of the 1000 fields re-renders per change (a counting `as` component
 *   wraps every Field), so the number in the bench name is asserted, not
 *   assumed. react-hook-form <Controller> runs the same tree shape and
 *   interaction for comparison (devDependency, bench-only, same as
 *   render.bench.ts).
 * Scenario B "async validation storm": 50 fields each with a debounced
 *   (5ms) async validator resolving at microtask level, form mode
 *   'onChange'. Each iteration fires 3 rapid changes on every field (150
 *   change events in one burst) and then waits for the whole form to
 *   settle via `trigger(form, [])` -- the public no-kick name-list form
 *   that only awaits the `validating` set draining. The bench guards
 *   inline that debounce coalesced the burst to exactly one validator run
 *   per field (50 runs, not 150).
 * Scenario C "full trigger wait": 100 mounted fields with mixed sync and
 *   async (microtask) validators; each iteration awaits `trigger(form)`
 *   over the whole form -- the kick-all + settle-until-empty pipeline
 *   submit rides on.
 */
import {test, expect} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import * as React from 'react';
import {Controller, useForm as useRhfForm} from 'react-hook-form';
import Form from '../../src/components/Form';
import {Field} from '../../src/components/Field';
import createForm, {trigger} from '../../src/form';
import type {Validator} from '../../src/hooks/validate';
import {waitUntil} from '../../src/util';

/** Longer time/warmup than the tinybench defaults to keep rme < 5%. */
const RUN_OPTIONS = {time: 2000, warmupTime: 1000};

/** CI regression bound, activated by BENCH_ASSERT=1 (ci.yml bench job).
 * Bounds carry ~5-8x headroom over the local 2026-09 means so shared
 * GitHub runners don't flake — they catch order-of-magnitude regressions,
 * not noise. Mean is in ms. */
const assertBound = (result: {latency: {mean: number}}, maxMs: number) => {
  if (process.env.BENCH_ASSERT) {
    expect(result.latency.mean).toBeLessThan(maxMs);
  }
};

const h = React.createElement;

/** -- Scenario A: 1000 controlled fields, change one ----------------- */

const COUNT_A = 1000;
const TARGET_A = 500;
const NAMES_A = Array.from({length: COUNT_A}, (_, i) => `f${i}`);
const INITIAL_A: Record<string, string> = {};
for (let i = 0; i < COUNT_A; i++) INITIAL_A[`f${i}`] = `v${i}`;

/** Counts every Field body render across the whole tree: the re-render
 * budget asserted by the scenario A bench is "1 of 1000 per change". */
let fieldRenders = 0;
const CountingInput = React.forwardRef<HTMLInputElement, any>((props, ref) => {
  fieldRenders += 1;
  return h('input', {...props, ref});
});

function F0rmThousandFields() {
  return h(
    Form,
    {initialValues: INITIAL_A},
    NAMES_A.map(name =>
      h(Field, {
        key: name,
        name,
        as: CountingInput,
        'data-testid': name
      })
    )
  );
}

function RhfThousandControllers() {
  const {control} = useRhfForm({defaultValues: INITIAL_A});
  return h(
    React.Fragment,
    null,
    NAMES_A.map(name =>
      h(Controller, {
        key: name,
        name,
        control,
        render: ({field}: any) => h('input', {'data-testid': name, ...field})
      })
    )
  );
}

/**
 * Lazily mount `tree` on the first (warmup) call and resolve the bench
 * target input afterwards. Explicit `cleanup()` first unmounts whatever
 * tree a previous bench left mounted, so no lifecycle hooks are needed.
 */
function mountOnce(tree: React.ReactElement, testid: string) {
  let input: HTMLInputElement | undefined;
  return () => {
    if (!input) {
      cleanup();
      render(tree);
      input = screen.getByTestId(testid) as HTMLInputElement;
    }
    return input;
  };
}

/** -- Scenario B: async validation storm ------------------------------ */

const COUNT_B = 50;
const DEBOUNCE_B = 5;
const NAMES_B = Array.from({length: COUNT_B}, (_, i) => `g${i}`);
const INITIAL_B: Record<string, string> = {};
for (let i = 0; i < COUNT_B; i++) INITIAL_B[`g${i}`] = `v${i}`;

/** Total validator executions across all fields -- the coalescing guard
 * divides this by burst. */
let asyncRuns = 0;
const asyncValidator: Validator = async () => {
  asyncRuns += 1;
  await Promise.resolve(); // microtask-level resolve
  return undefined;
};

const stormForm = createForm({
  initialValues: INITIAL_B,
  mode: 'onChange'
});

function StormFiftyFields() {
  return h(
    Form,
    {form: stormForm},
    NAMES_B.map(name =>
      h(Field, {
        key: name,
        name,
        validate: asyncValidator,
        validateDebounce: DEBOUNCE_B,
        'data-testid': name
      })
    )
  );
}

/** Lazily mount the storm tree and resolve all 50 target inputs. */
function mountStormOnce() {
  let inputs: HTMLInputElement[] | undefined;
  return () => {
    if (!inputs) {
      cleanup();
      render(h(StormFiftyFields));
      inputs = NAMES_B.map(
        name => screen.getByTestId(name) as HTMLInputElement
      );
    }
    return inputs;
  };
}

/** -- Scenario C: full-form trigger wait ------------------------------ */

const COUNT_C = 100;
const NAMES_C = Array.from({length: COUNT_C}, (_, i) => `t${i}`);
const INITIAL_C: Record<string, string> = {};
for (let i = 0; i < COUNT_C; i++) INITIAL_C[`t${i}`] = `v${i}`;

const syncValidator: Validator = () => undefined;
const lazyValidator: Validator = async () => {
  await Promise.resolve(); // microtask-level resolve
  return undefined;
};

const triggerForm = createForm({initialValues: INITIAL_C});

function MixedHundredFields() {
  return h(
    Form,
    {form: triggerForm},
    NAMES_C.map((name, i) =>
      h(Field, {
        key: name,
        name,
        validate: i % 2 ? syncValidator : lazyValidator,
        'data-testid': name
      })
    )
  );
}

function mountMixedOnce() {
  let input: HTMLInputElement | undefined;
  return () => {
    if (!input) {
      cleanup();
      render(h(MixedHundredFields));
      input = screen.getByTestId(`t${TARGET_A % COUNT_C}`) as HTMLInputElement;
    }
    return input;
  };
}

/** -- Benches --------------------------------------------------------- */

test('1000-field controlled form - single field change', async ({bench}) => {
  const f0rmInput = mountOnce(h(F0rmThousandFields), `f${TARGET_A}`);
  const rhfControllerInput = mountOnce(
    h(RhfThousandControllers),
    `f${TARGET_A}`
  );
  // Rotate the written value: an identical value would compare equal in
  // the subscription snapshot and skip the re-render being measured.
  let flip = 0;

  const result = await bench('f0rm Field: change re-renders 1 of 1000', () => {
    const input = f0rmInput();
    const before = fieldRenders;
    flip = (flip + 1) % 4;
    fireEvent.change(input, {target: {value: `w${flip}`}});
    const rerenders = fieldRenders - before;
    if (rerenders !== 1)
      throw new Error(
        `field-level subscription broken at scale: ${rerenders} of ${COUNT_A} fields re-rendered`
      );
  }).run(RUN_OPTIONS);
  // Local mean 0.892ms (2026-09); bound ~5.6x headroom for shared runners.
  assertBound(result, 5.0);

  await bench('react-hook-form Controller: change 1 of 1000', () => {
    const input = rhfControllerInput();
    flip = (flip + 1) % 4;
    fireEvent.change(input, {target: {value: `w${flip}`}});
  }).run(RUN_OPTIONS);
});

test('async validation storm - 50 debounced async validators', async ({
  bench
}) => {
  const stormInputs = mountStormOnce();
  let flip = 0;

  const result = await bench(
    'burst: 3 changes x 50 fields, settle via trigger (1 run per field)',
    async () => {
      const inputs = stormInputs();
      const runsBefore = asyncRuns;
      for (const input of inputs) {
        flip = (flip + 1) % 4;
        fireEvent.change(input, {target: {value: `w${flip}`}});
        fireEvent.change(input, {target: {value: `w${(flip + 1) % 4}`}});
        fireEvent.change(input, {target: {value: `w${(flip + 2) % 4}`}});
      }
      // Wait out every debounce window and in-flight promise: the same
      // validating-set drain trigger's wait uses (trigger with an empty
      // name list resolves vacuously — it kicks and waits nothing — so
      // the settle wait is spelled out here).
      await waitUntil(
        stormForm.emitter,
        'validating',
        () => stormForm.validating.size === 0,
        () => false
      );
      const runs = asyncRuns - runsBefore;
      if (runs !== COUNT_B)
        throw new Error(
          `debounce coalescing broken: ${runs} validator runs for a 3 x ${COUNT_B} burst`
        );
    }
  ).run(RUN_OPTIONS);
  // Local mean ~21ms (2026-09); bound ~7x headroom for shared runners.
  assertBound(result, 150);
});

test('full trigger wait - 100 mixed validators', async ({bench}) => {
  const mixedInput = mountMixedOnce();

  const result = await bench(
    'await trigger(form): 50 sync + 50 async validators settle',
    async () => {
      // Touch the tree so the lazy mount happens before timing (warmup
      // covers this, but the guard below must never see an unmounted form).
      mixedInput();
      const ok = await trigger(triggerForm);
      if (!ok) throw new Error('expected the all-valid form to pass trigger');
    }
  ).run(RUN_OPTIONS);
  // Local mean 5.92ms (2026-09); bound ~7x headroom for shared runners.
  assertBound(result, 40);
});
