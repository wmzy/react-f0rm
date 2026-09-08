import {describe, it, expect} from 'vitest';
import createForm, {setTouched, hasTouched, isTouched} from '../../src/form';

describe('setTouched / hasTouched / isTouched', () => {
  it('sets and checks touched state', () => {
    const form = createForm();
    expect(hasTouched(form, 'name')).toBe(false);
    setTouched(form, 'name');
    expect(hasTouched(form, 'name')).toBe(true);
  });

  it('isTouched is an alias for hasTouched', () => {
    const form = createForm();
    expect(isTouched(form, 'name')).toBe(false);
    setTouched(form, 'name');
    expect(isTouched(form, 'name')).toBe(true);
  });
});
