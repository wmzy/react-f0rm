// Style-injection lifecycle for the devtools entry. Kept in its own file:
// the import-time assertion below only holds in a document no earlier
// case has rendered into.
import {describe, it, expect} from 'vitest';
import {render} from '@testing-library/react';
import React from 'react';
import createForm from '../../src/form';
import {FormProvider} from '../../src/context';
import {Devtools} from '../../src/devtools';

describe('devtools styles lifecycle', () => {
  it('has no import-time side effect', () => {
    // The devtools modules were already evaluated by the imports above.
    // A module-level injectDevtoolsStyles() call would have created the
    // element by now — package.json declares `sideEffects: false`, so
    // bundlers drop exactly that kind of injection in production builds.
    expect(document.querySelector('#react-f0rm-devtools-style')).toBeNull();
  });

  it('injects the stylesheet when Devtools mounts, exactly once', () => {
    const mount = () =>
      render(
        <FormProvider value={createForm({initialValues: {}})}>
          <Devtools />
        </FormProvider>
      );

    mount();
    expect(document.querySelector('#react-f0rm-devtools-style')).toBeTruthy();

    mount();
    expect(
      document.querySelectorAll('#react-f0rm-devtools-style')
    ).toHaveLength(1);
  });
});
