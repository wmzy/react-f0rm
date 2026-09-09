// @vitest-environment node
import {describe, it, expect} from 'vitest';
import {injectDevtoolsStyles} from '../../src/devtools/styles';

describe('Devtools SSR', () => {
  it('no-ops without a DOM: a real node environment, not a stubbed global', () => {
    expect(typeof document).toBe('undefined');
    expect(() => injectDevtoolsStyles()).not.toThrow();
  });
});
