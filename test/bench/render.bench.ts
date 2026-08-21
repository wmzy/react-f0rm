/**
 * Benchmark: render/interaction cost of field-level subscriptions (not part
 * of the unit suite; run with `npx vitest bench --run
 * test/bench/render.bench.ts`). Provides the data behind the README
 * performance claim: with 100 controlled fields mounted, changing one field
 * re-renders only that field.
 *
 * Scenario a) f0rm <Field>: 100 controlled inputs mounted once via
 *   @testing-library/react (outside the timed loop; React Testing Library is
 *   fine here because render is not in the loop -- only fireEvent.change is
 *   timed), then change input #50 per iteration.
 * Scenario b) react-hook-form <Controller>: the controlled, per-field
 *   subscribed counterpart from RHF, same tree shape and same interaction.
 *   react-hook-form is a devDependency used ONLY for this comparison bench;
 *   it never ships in runtime dependencies.
 * Scenario c) react-hook-form register(): uncontrolled ref-only floor (no
 *   React re-render at all) for context.
 * Scenario d) submit path: getValues + validate with 100 sync validators
 *   (one invalid field, so every run exercises the error path).
 */
import {bench, describe} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import * as React from 'react';
import {Controller, useForm as useRhfForm} from 'react-hook-form';
import Form from '../../src/components/Form';
import {Field} from '../../src/components/Field';
import createForm, {getValues, setValue, validate} from '../../src/form';

const COUNT = 100;
const TARGET = 50;
const NAMES = Array.from({length: COUNT}, (_, i) => `f${i}`);
const INITIAL_VALUES: Record<string, string> = {};
for (let i = 0; i < COUNT; i++) INITIAL_VALUES[`f${i}`] = `v${i}`;

const h = React.createElement;

function F0rmHundredFields() {
  return h(
    Form,
    {initialValues: INITIAL_VALUES},
    NAMES.map(name => h(Field, {key: name, name, 'data-testid': name}))
  );
}

function RhfHundredControllers() {
  const {control} = useRhfForm({defaultValues: INITIAL_VALUES});
  return h(
    React.Fragment,
    null,
    NAMES.map(name =>
      h(Controller, {
        key: name,
        name,
        control,
        render: ({field}: any) => h('input', {'data-testid': name, ...field})
      })
    )
  );
}

function RhfHundredRegistered() {
  const {register} = useRhfForm({defaultValues: INITIAL_VALUES});
  return h(
    React.Fragment,
    null,
    NAMES.map(name => {
      const {ref, ...props} = register(name);
      return h('input', {key: name, 'data-testid': name, ...props, ref});
    })
  );
}

/**
 * Lazily mount `tree` on the first (warmup) call and resolve the bench
 * target input afterwards. Explicit `cleanup()` first unmounts whatever
 * tree a previous bench left mounted, so no lifecycle hooks are needed.
 */
function mountOnce(tree: React.ReactElement) {
  let input: HTMLInputElement | undefined;
  return () => {
    if (!input) {
      cleanup();
      render(tree);
      input = screen.getByTestId(`f${TARGET}`) as HTMLInputElement;
    }
    return input;
  };
}

/** Longer time/warmup than the tinybench defaults to keep rme < 5%. */
const BENCH_OPTIONS = {time: 2000, warmupTime: 1000};

describe('single field change - 100 controlled inputs mounted', () => {
  const f0rmInput = mountOnce(h(F0rmHundredFields));
  const rhfControllerInput = mountOnce(h(RhfHundredControllers));
  const rhfRegisterInput = mountOnce(h(RhfHundredRegistered));
  // Rotate the written value: an identical value would compare equal in the
  // subscription snapshot and skip the re-render we are here to measure.
  let flip = 0;

  bench(
    'f0rm Field: change re-renders 1 of 100',
    () => {
      const input = f0rmInput();
      flip = (flip + 1) % 4;
      fireEvent.change(input, {target: {value: `w${flip}`}});
    },
    BENCH_OPTIONS
  );

  bench(
    'react-hook-form Controller: change 1 of 100',
    () => {
      const input = rhfControllerInput();
      flip = (flip + 1) % 4;
      fireEvent.change(input, {target: {value: `w${flip}`}});
    },
    BENCH_OPTIONS
  );

  bench(
    'react-hook-form register (uncontrolled): change 1 of 100',
    () => {
      const input = rhfRegisterInput();
      flip = (flip + 1) % 4;
      fireEvent.change(input, {target: {value: `w${flip}`}});
    },
    BENCH_OPTIONS
  );
});

describe('submit path - 100 sync validators', () => {
  const form = createForm({initialValues: INITIAL_VALUES});
  for (const name of NAMES) {
    // Register sync validators straight on the validators Map -- exactly
    // what useValidate does on mount, minus the React tree (this bench
    // measures the form submit path, not rendering).
    form.validators.set(JSON.stringify([name]), (value: string) =>
      value.length > 1 ? undefined : 'too short'
    );
  }
  // One invalid field so every run exercises the full error path
  // (validator -> setError -> throw -> catch).
  setValue(form, `f${TARGET}`, 'x');

  bench(
    'getValues + validate',
    async () => {
      getValues(form);
      await validate(form);
    },
    BENCH_OPTIONS
  );
});
