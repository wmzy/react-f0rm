// form.register: the non-hook field binding (react-hook-form's register
// contract). These tests drive it headlessly — no React anywhere — like
// form-core-pipeline.test.js: ref attach/detach simulate mount/unmount,
// plain event objects simulate DOM events.
import {describe, it, expect, vi} from 'vitest';
import createForm, {
  getError,
  getValue,
  getValues,
  reset,
  setFocus,
  trigger
} from '../../src/form';

/** A jsdom input with focus/select spies, shaped like a real bound node. */
function makeInput({type = 'text', value = '', checked = false} = {}) {
  const el = document.createElement('input');
  if (type !== 'text') el.type = type;
  el.value = value;
  if (type === 'checkbox') el.checked = checked;
  el.focus = vi.fn();
  el.select = vi.fn();
  return el;
}

const changeEvent = (over = {}) => ({
  target: {type: 'text', value: 'typed', ...over}
});

describe('form.register', () => {
  it('returns spreadable props: name, onChange, onBlur, ref', () => {
    const form = createForm();
    const props = form.register('a');
    expect(props.name).toBe('["a"]');
    expect(typeof props.onChange).toBe('function');
    expect(typeof props.onBlur).toBe('function');
    expect(typeof props.ref).toBe('function');
  });

  it('onChange writes the extracted value into the store', () => {
    const form = createForm({initialValues: {a: ''}});
    const {onChange} = form.register('a');
    onChange(changeEvent({value: 'typed'}));
    expect(getValue(form, 'a')).toBe('typed');
  });

  it('ref attach seeds the element DOM content when the store has no value', () => {
    const form = createForm({initialValues: {}});
    const node = makeInput({value: 'seeded'});
    form.register('a').ref(node);
    expect(getValue(form, 'a')).toBe('seeded');
    expect(getValues(form)).toEqual({a: 'seeded'});
  });

  it('ref attach never clobbers an existing store value', () => {
    const form = createForm({initialValues: {a: 'base'}});
    const node = makeInput({value: 'dom-value'});
    form.register('a').ref(node);
    expect(getValue(form, 'a')).toBe('base');
  });

  it('checkbox bindings store checked instead of the value attribute', () => {
    // Empty baseline: the DOM is the source, so the seed reads `checked`.
    const form = createForm({initialValues: {}});
    const {ref, onChange} = form.register('a');
    const node = makeInput({type: 'checkbox', checked: true});
    ref(node);
    expect(getValue(form, 'a')).toBe(true); // seeded from checked
    onChange({target: {type: 'checkbox', checked: false}});
    expect(getValue(form, 'a')).toBe(false);
  });

  it('file bindings store the FileList', () => {
    const form = createForm({initialValues: {a: undefined}});
    const files = [new File(['x'], 'x.txt')];
    const {onChange} = form.register('a');
    onChange({target: {type: 'file', files}});
    expect(getValue(form, 'a')).toBe(files);
  });

  it('valueAsNumber / valueAsDate store the typed DOM accessors', () => {
    const form = createForm({initialValues: {}});
    form
      .register('n', {valueAsNumber: true})
      .onChange(changeEvent({valueAsNumber: 42}));
    form
      .register('d', {valueAsDate: true})
      .onChange(changeEvent({valueAsDate: '2026-01-02'}));
    expect(getValue(form, 'n')).toBe(42);
    expect(getValue(form, 'd')).toBe('2026-01-02');
  });

  it('eventToValue overrides the default extraction', () => {
    const form = createForm({initialValues: {}});
    form.register('a', {eventToValue: e => e.custom}).onChange({custom: 'raw'});
    expect(getValue(form, 'a')).toBe('raw');
  });

  it('detach tombstones the value; shouldUnregister: false keeps it', () => {
    const form = createForm({initialValues: {a: ''}});
    const {ref, onChange} = form.register('a');
    const node = makeInput();
    ref(node);
    onChange(changeEvent({value: 'typed'}));
    ref(null);
    expect(getValues(form)).toEqual({});

    const keep = createForm({initialValues: {a: ''}});
    const node2 = makeInput();
    const binding = keep.register('a', {shouldUnregister: false});
    binding.ref(node2);
    binding.onChange(changeEvent({value: 'typed'}));
    binding.ref(null);
    expect(getValue(keep, 'a')).toBe('typed');
  });

  it('restores the snapshot across a StrictMode-style detach/reattach', () => {
    const form = createForm({initialValues: {a: ''}});
    const binding = form.register('a');
    binding.ref(makeInput());
    binding.onChange(changeEvent({value: 'typed'}));
    // React 19 StrictMode detaches and re-attaches refs on the dev remount.
    binding.ref(null);
    binding.ref(makeInput({value: 'fresh-dom'}));
    expect(getValue(form, 'a')).toBe('typed');
  });

  it('rules wire into the validation pipeline through mode gating', async () => {
    const form = createForm({
      initialValues: {a: ''},
      mode: 'onSubmit'
    });
    const binding = form.register('a', {
      rules: {required: true},
      mode: 'onChange'
    });
    binding.ref(makeInput());
    // Empty write under mode onChange: the required sync gate fires.
    binding.onChange(changeEvent({value: ''}));
    expect(getError(form, 'a')?.message).toBe('This field is required');
    // trigger sees the registered validator like any hook-registered one.
    await expect(trigger(form)).resolves.toBe(false);
    // Detaching drops the validator registration with the binding.
    binding.ref(null);
    expect(form.validators.size).toBe(0);
  });

  it('a form-level messages table overrides the default rule copy', async () => {
    const form = createForm({
      initialValues: {a: ''},
      mode: 'onSubmit',
      messages: {required: '必填', minLength: '至少 {bound} 位'}
    });
    const binding = form.register('a', {
      rules: {required: true, minLength: 2},
      mode: 'onChange'
    });
    binding.ref(makeInput());
    // The sync required gate reads the table.
    binding.onChange(changeEvent({value: ''}));
    expect(getError(form, 'a')?.message).toBe('必填');
    // The debounced rules validator reads it too.
    binding.onChange(changeEvent({value: 'x'}));
    await trigger(form);
    expect(getError(form, 'a')?.message).toBe('至少 2 位');
    // A field's own message still wins over the table.
    const own = form.register('b', {
      rules: {required: '自定义必填'},
      mode: 'onChange'
    });
    own.ref(makeInput());
    own.onChange(changeEvent({value: ''}));
    expect(getError(form, 'b')?.message).toBe('自定义必填');
  });

  it('bulk reset rewrites the bound DOM element without a render', () => {
    const form = createForm({initialValues: {a: ''}});
    const {ref, onChange} = form.register('a');
    const node = makeInput();
    ref(node);
    // The browser updates the DOM before React's onChange fires.
    node.value = 'typed';
    onChange(changeEvent({value: 'typed'}));
    expect(node.value).toBe('typed');
    reset(form);
    expect(node.value).toBe('');
  });

  it("wires the 'focusError' channel: setFocus focuses the bound element", () => {
    const form = createForm({initialValues: {a: ''}});
    const {ref} = form.register('a');
    const node = makeInput();
    ref(node);
    setFocus(form, 'a');
    expect(node.focus).toHaveBeenCalledTimes(1);
    // Detached elements stop answering focus requests.
    ref(null);
    setFocus(form, 'a');
    expect(node.focus).toHaveBeenCalledTimes(1);
  });
});
