import {describe, it, expect, vi} from 'vitest';
import {on} from '../../src/emitter';
import createForm, {setFocus} from '../../src/form';

describe('setFocus', () => {
  it('emits focusError with the field path key', () => {
    const form = createForm();
    const listener = vi.fn();
    on(form.emitter, 'focusError', listener);

    setFocus(form, 'email');

    expect(listener).toHaveBeenCalledWith('["email"]');
  });

  it('normalizes segments paths to the same key shape as bound fields', () => {
    const form = createForm();
    const listener = vi.fn();
    on(form.emitter, 'focusError', listener);

    setFocus(form, ['items', 0, 'qty']);

    expect(listener).toHaveBeenCalledWith('["items",0,"qty"]');
  });

  it('passes options as a backward-compatible second argument', () => {
    const form = createForm();
    const listener = vi.fn();
    on(form.emitter, 'focusError', listener);

    setFocus(form, 'email', {shouldSelect: true});

    expect(listener).toHaveBeenCalledWith('["email"]', {shouldSelect: true});
  });

  it('still reaches single-argument subscribers when no options are given', () => {
    const form = createForm();
    // The pre-setFocus subscriber shape: only the path key is declared.
    const calls = [];
    on(form.emitter, 'focusError', key => calls.push(key));

    setFocus(form, 'name');

    expect(calls).toEqual(['["name"]']);
  });

  it('does not throw for names with no subscriber', () => {
    const form = createForm();
    expect(() => setFocus(form, 'missing')).not.toThrow();
  });
});
