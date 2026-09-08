import {describe, it, expect, vi} from 'vitest';
import {subscribe} from '../../src/subscribe';
import {on} from '../../src/emitter';
import createForm, {
  getValue,
  setValue,
  getValueByPath,
  setValueByPath,
  getError,
  getFieldErrors,
  setError,
  setErrorByPath,
  hasErrors,
  setTouched,
  hasTouched,
  isTouched,
  isDirty,
  getDirtyFields,
  removeField,
  setInitialValues,
  reset,
  getValues,
  ensureValidate,
  setValidatingByPath,
  setIsSubmitting,
  incrementSubmitCount,
  setSubmitSuccessful,
  handleSubmit,
  trigger,
  resetField,
  getFieldState,
  VALIDATION_OUTCOME
} from '../../src/form';
import createPath from '../../src/path';

describe('getValue / setValue', () => {
  it('gets and sets a field value', () => {
    const form = createForm({initialValues: {}});
    setValue(form, 'name', 'hello');
    expect(getValue(form, 'name')).toBe('hello');
  });

  it('gets initial value when no value set', () => {
    const form = createForm({initialValues: {name: 'initial'}});
    expect(getValue(form, 'name')).toBe('initial');
  });

  it('gets value by path', () => {
    const form = createForm({initialValues: {}});
    const path = createPath('user.email');
    setValueByPath(form, path, 'test@example.com');
    expect(getValueByPath(form, path)).toBe('test@example.com');
  });

  it('leaf read resolves through a live ancestor write, not initialValues', () => {
    // A whole-branch replace (setValue at a parent path, every array
    // operation) must not leave leaf readers on the pre-edit snapshot:
    // the live ancestor key shadows the baseline exactly like getValues'
    // merge layers it over initialValues.
    const form = createForm({initialValues: {items: [{name: 'old'}]}});
    setValue(form, 'items', [{name: 'new'}]);
    expect(getValue(form, 'items[0].name')).toBe('new');
    expect(getValues(form)).toEqual({items: [{name: 'new'}]});
  });

  it('paths missing from a replaced branch read undefined, not the baseline', () => {
    // The initial snapshot must not fill holes inside a live branch: the
    // wholesale write dropped qty, so qty reads undefined even though
    // initialValues still carries it.
    const form = createForm({
      initialValues: {items: [{name: 'old', qty: 1}]}
    });
    setValue(form, 'items', [{name: 'new'}]);
    expect(getValue(form, 'items[0].qty')).toBeUndefined();
  });

  it('a replaced branch supersedes earlier leaf edits at that branch', () => {
    // The typed leaf key belongs to the replaced generation: reads and the
    // getValues merge must both settle on the new value, and the array
    // container must survive the merge as an array.
    const form = createForm({initialValues: {items: [{name: 'old'}]}});
    setValue(form, 'items[0].name', 'typed');
    setValue(form, 'items[0]', {name: 'new'});
    expect(getValue(form, 'items[0].name')).toBe('new');
    expect(getValues(form)).toEqual({items: [{name: 'new'}]});
  });

  it('a re-written ancestor supersedes descendant edits regardless of write order', () => {
    // Insertion order must not decide the winner: the latest write at the
    // coarsest path is the newest generation of the subtree.
    const form = createForm({initialValues: {}});
    setValue(form, 'a', {b: 1});
    setValue(form, 'a.b', 2);
    setValue(form, 'a', {c: 3});
    expect(getValue(form, 'a.b')).toBeUndefined();
    expect(getValues(form)).toEqual({a: {c: 3}});
  });

  it('a finer write still layers over an earlier ancestor write', () => {
    const form = createForm({initialValues: {items: [{name: 'old'}]}});
    setValue(form, 'items[0]', {name: 'new', qty: 2});
    setValue(form, 'items[0].qty', 3);
    expect(getValue(form, 'items[0].name')).toBe('new');
    expect(getValue(form, 'items[0].qty')).toBe(3);
    expect(getValues(form)).toEqual({items: [{name: 'new', qty: 3}]});
  });

  it('tombstone still blocks the baseline when no ancestor is live', () => {
    const form = createForm({initialValues: {items: [{name: 'old'}]}});
    removeField(form, 'items[0].name');
    expect(getValue(form, 'items[0].name')).toBeUndefined();
  });

  it('does not validate or touch without options', () => {
    const form = createForm({initialValues: {}});
    form.validators.set(createPath('name').key, () => {
      setErrorByPath(form, createPath('name'), 'required');
    });
    setValue(form, 'name', '');
    expect(getValue(form, 'name')).toBe('');
    expect(getError(form, 'name')).toBeUndefined();
    expect(hasTouched(form, 'name')).toBe(false);
  });

  it('runs only the field validator with shouldValidate', () => {
    const form = createForm({initialValues: {}});
    const other = vi.fn();
    form.validators.set(createPath('name').key, () => {
      setErrorByPath(form, createPath('name'), 'required');
    });
    form.validators.set(createPath('email').key, other);
    setValue(form, 'name', '', {shouldValidate: true});
    expect(getError(form, 'name')).toEqual({
      type: 'custom',
      message: 'required'
    });
    expect(other).not.toHaveBeenCalled();
  });

  it('marks the field touched with shouldTouch', () => {
    const form = createForm({initialValues: {}});
    setValue(form, 'name', 'x', {shouldTouch: true});
    expect(hasTouched(form, 'name')).toBe(true);
  });

  it('shouldDirty: false lands the value without dirtying the field', () => {
    const form = createForm({initialValues: {name: 'init'}});
    setValue(form, 'name', 'committed', {shouldDirty: false});
    expect(getValue(form, 'name')).toBe('committed');
    expect(getDirtyFields(form)).toEqual({});
    expect(isDirty(form)).toBe(false);
    expect(getFieldState(form, 'name').isDirty).toBe(false);
  });

  it('shouldDirty: false re-bases the field for later writes', () => {
    const form = createForm({initialValues: {name: 'init'}});
    setValue(form, 'name', 'committed', {shouldDirty: false});
    // A later write equal to the committed baseline stays clean.
    setValue(form, 'name', 'committed');
    expect(getDirtyFields(form)).toEqual({});
    // A later write differing from it dirties the field again.
    setValue(form, 'name', 'edited');
    expect(getDirtyFields(form)).toEqual({name: true});
  });

  it('shouldDirty: true keeps the derived behavior', () => {
    const form = createForm({initialValues: {name: 'init'}});
    setValue(form, 'name', 'x', {shouldDirty: true});
    expect(getDirtyFields(form)).toEqual({name: true});
    // Spelled out or omitted, the flag is the same comparison.
    setValue(form, 'name', 'init');
    expect(getDirtyFields(form)).toEqual({});
  });

  it('applies options through setValueByPath too', () => {
    const form = createForm({initialValues: {}});
    const path = createPath('name');
    form.validators.set(path.key, () => {
      setErrorByPath(form, path, 'required');
    });
    setValueByPath(form, path, '', {shouldValidate: true, shouldTouch: true});
    expect(getError(form, 'name')).toEqual({
      type: 'custom',
      message: 'required'
    });
    expect(hasTouched(form, 'name')).toBe(true);
  });

  it('accepts an updater function receiving the current value', () => {
    const form = createForm({initialValues: {count: 1, tags: ['a']}});
    setValue(form, 'count', c => c + 1);
    expect(getValue(form, 'count')).toBe(2);
    setValue(form, 'tags', tags => [...tags, 'b']);
    expect(getValue(form, 'tags')).toEqual(['a', 'b']);
    // The updater reads the merged value: an unwritten field falls back
    // to initialValues.
    setValue(form, 'count', c => c * 10);
    expect(getValue(form, 'count')).toBe(20);
  });

  it('updater result flows through the normal write pipeline', () => {
    const form = createForm({initialValues: {count: 1}});
    const unsubscribe = on(form.emitter, 'change', () => {});
    setValue(form, 'count', c => c + 1, {shouldTouch: true});
    expect(hasTouched(form, 'count')).toBe(true);
    expect(getDirtyFields(form)).toEqual({count: true});
    unsubscribe();
  });
});

describe('getValues', () => {
  it('returns all values merged with initialValues', () => {
    const form = createForm({initialValues: {a: 1, b: 2}});
    setValue(form, 'b', 99);
    setValue(form, 'c', 3);
    const values = getValues(form);
    expect(values).toEqual({a: 1, b: 99, c: 3});
  });

  it('hands back a deep-frozen snapshot when no field is set (DEV)', () => {
    const initialValues = {a: 1};
    const form = createForm({initialValues});
    const values = getValues(form);
    expect(values).toEqual(initialValues);
    // DEV builds clone-then-freeze so consumer mutations throw instead of
    // corrupting the shared memoized result — the baseline itself stays
    // mutable (production builds share the reference, unchanged).
    expect(Object.isFrozen(values)).toBe(true);
    expect(Object.isFrozen(initialValues)).toBe(false);
  });

  it('later ancestor write supersedes earlier descendant writes', () => {
    const form = createForm({initialValues: {}});
    setValue(form, 'a.b', 1);
    setValue(form, 'a', {c: 2});
    expect(getValues(form)).toEqual({a: {c: 2}});
  });

  it('later descendant write merges into an earlier ancestor write', () => {
    const form = createForm({initialValues: {}});
    setValue(form, 'a', {b: 1, keep: true});
    setValue(form, 'a.b', 2);
    expect(getValues(form)).toEqual({a: {b: 2, keep: true}});
  });

  it('memoizes per form: same reference between writes, fresh after one', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'b', 2);
    const first = getValues(form);
    // Consecutive reads hit the cache (submit, changeValue and form-level
    // validate all re-read the whole tree between writes).
    expect(getValues(form)).toBe(first);
    expect(getValues(form)).toBe(first);
    // Any write invalidates: the next read re-merges and hands back a
    // fresh tree with the new content.
    setValue(form, 'b', 3);
    const second = getValues(form);
    expect(second).not.toBe(first);
    expect(second).toEqual({a: 1, b: 3});
    // Mutating the cached result is unsupported (read-only contract):
    // between writes every reader shares the same reference.
  });

  it('freezes nested containers and throws on consumer mutation (DEV)', () => {
    const form = createForm({initialValues: {user: {name: 'zlt'}}});
    const values = getValues(form);
    expect(Object.isFrozen(values.user)).toBe(true);
    expect(() => {
      values.user.name = 'mutated';
    }).toThrow(TypeError);
    // The failed mutation never touched the form state.
    expect(getValue(form, 'user.name')).toBe('zlt');
    // Non-plain values pass through by reference, unfrozen.
    const date = new Date(0);
    class Token {
      constructor(v) {
        this.v = v;
      }
    }
    const token = new Token(1);
    setValue(form, 'meta', {date, token});
    const withMeta = getValues(form);
    expect(withMeta.meta.date).toBe(date);
    expect(Object.isFrozen(date)).toBe(false);
    expect(withMeta.meta.token).toBe(token);
    expect(Object.isFrozen(withMeta.meta.token)).toBe(false);
    // Fresh writes recompute a fresh frozen snapshot.
    setValue(form, 'user.name', 'edited');
    const after = getValues(form);
    expect(after).not.toBe(values);
    expect(Object.isFrozen(after.user)).toBe(true);
    expect(after.user.name).toBe('edited');
  });

  it('cache invalidation covers every value-mutating entry point', async () => {
    // setValue/removeField/setInitialValues/reset/resetField and a schema
    // round's parsedValues each must drop the cached merge.
    const form = createForm({initialValues: {a: 1, b: 2, c: 3, d: 4}});
    getValues(form);

    setValue(form, 'a', 10);
    expect(getValues(form)).toEqual({a: 10, b: 2, c: 3, d: 4});

    removeField(form, 'b');
    expect(getValues(form)).toEqual({a: 10, c: 3, d: 4});

    // setInitialValues re-seeds: live edits (a: 10) and tombstones (b)
    // are cleared, fields fall back to the new baseline.
    setInitialValues(form, {a: 0, c: 0, d: 0});
    expect(getValues(form)).toEqual({a: 0, c: 0, d: 0});

    setValue(form, 'c', 30);
    resetField(form, 'c', {value: 33});
    expect(getValues(form)).toEqual({a: 0, c: 33, d: 0});

    reset(form, {a: 1});
    expect(getValues(form)).toEqual({a: 1});
  });

  it("a schema round's parsedValues invalidates the cache too", async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({[VALIDATION_OUTCOME]: true, values: {a: 'parsed'}})
    });
    expect(getValues(form)).toEqual({a: 1});
    await trigger(form);
    // parsedValues layers over initialValues in the merge — the cached
    // pre-parse tree must not shadow it.
    expect(getValues(form)).toEqual({a: 'parsed'});
  });

  it('flows the form type to the returned record (typed context)', () => {
    // Type context, checked by tsc in TS consumers: createForm infers
    // Form<{a: string}>, so getValues(form) is that record and .a is a
    // string — the generic threads T through instead of returning any.
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    expect(getValues(form).a).toBe('typed');
  });
});

describe('removeField', () => {
  it('removes field state', () => {
    const form = createForm();
    setValue(form, 'name', 'value');
    setError(form, 'name', 'error');
    setTouched(form, 'name');
    removeField(form, 'name');
    expect(getValue(form, 'name')).toBeUndefined();
    expect(getError(form, 'name')).toBeUndefined();
    expect(hasTouched(form, 'name')).toBe(false);
  });

  it('tombstones the path so it does not fall back to initialValues', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    removeField(form, 'a');
    expect(getValue(form, 'a')).toBeUndefined();
    const values = getValues(form);
    expect(values).toEqual({});
    expect('a' in values).toBe(false);
    // getValues must not corrupt initialValues while merging.
    expect(form.initialValues).toEqual({a: 'initial'});
  });

  it('a tombstone is overwritten by a later setValue', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    removeField(form, 'a');
    setValue(form, 'a', 'new');
    expect(getValue(form, 'a')).toBe('new');
    expect(getValues(form)).toEqual({a: 'new'});
  });

  it('a tombstone never shadows a live parent value (array rewrite)', () => {
    const form = createForm({initialValues: {items: ['a', 'b', 'c']}});
    setValue(form, 'items', ['b', 'c']);
    // Item fields unmount after the array rewrite; their tombstones must
    // not punch holes in the live array.
    removeField(form, 'items[0]');
    removeField(form, 'items[1]');
    expect(getValues(form)).toEqual({items: ['b', 'c']});
  });

  it('rewriting a parent path supersedes stale child tombstones', () => {
    const form = createForm({initialValues: {items: ['a', 'b', 'c']}});
    setValue(form, 'items[2]', 'typed');
    removeField(form, 'items[0]');
    removeField(form, 'items[1]');
    setValue(form, 'items', ['b', 'c']);
    expect(getValues(form)).toEqual({items: ['b', 'c']});
  });

  it('writing a descendant path clears an ancestor tombstone', () => {
    const form = createForm({initialValues: {o: {p: 1}}});
    removeField(form, 'o');
    setValue(form, 'o.p', 2);
    expect(getValues(form)).toEqual({o: {p: 2}});
  });

  it('does not tombstone a path with a live descendant write', () => {
    const form = createForm({initialValues: {a: {b: {c: 1}}}});
    // A deep child is still mounted (live write) when its container
    // unmounts: the prefix scan must keep the branch alive.
    setValue(form, 'a.b.c', 2);
    removeField(form, 'a.b');
    expect(form.deleted.has('["a","b"]')).toBe(false);
  });

  it('does not tombstone a path under a live ancestor write', () => {
    const form = createForm({initialValues: {}});
    setValue(form, 'a', {b: 1, c: 2});
    removeField(form, 'a.b');
    expect(form.deleted.has('["a","b"]')).toBe(false);
  });

  it('a nested tombstone removes exactly that key from getValues output', () => {
    const form = createForm({initialValues: {a: {b: 1, c: 2}}});
    setValue(form, 'a.c', 20);
    removeField(form, 'a.c');
    // 'a.c' is gone; sibling 'a.b' survives and nothing is written back
    // under the removed key.
    expect(getValues(form)).toEqual({a: {b: 1}});
  });

  it('emits path-scoped events: sibling subscribers stay asleep', () => {
    const form = createForm({initialValues: {a: 1, b: 2}});
    setValue(form, 'a', 10);
    setValue(form, 'b', 20);
    const sibling = vi.fn();
    const removed = vi.fn();
    subscribe(form, {name: 'a', callback: sibling});
    subscribe(form, {name: 'b', callback: removed});
    removeField(form, 'b');
    // 'b' carries a path payload: watchers on the sibling path 'a' (leaf
    // and branch alike) do not re-sync.
    expect(sibling).not.toHaveBeenCalled();
    expect(removed).toHaveBeenCalledTimes(1);
  });

  it('emits path-scoped events: watchers on the path and below wake', () => {
    const form = createForm({initialValues: {o: {p: 1, q: 2}}});
    setValue(form, 'o.p', 10);
    const exact = vi.fn();
    const descendant = vi.fn();
    const errors = vi.fn();
    subscribe(form, {name: 'o', callback: exact});
    subscribe(form, {name: 'o.p', callback: descendant});
    subscribe(form, {name: 'o.p', event: 'errors', callback: errors});
    setError(form, 'o.p', 'bad');
    exact.mockClear();
    descendant.mockClear();
    errors.mockClear();
    removeField(form, 'o.p');
    // Branch watcher on the ancestor: its subtree lost a leaf.
    expect(exact).toHaveBeenCalledTimes(1);
    // Leaf watcher on the removed path itself, and its error watcher:
    // exact-key matches both.
    expect(descendant).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('emits path-scoped events: a leaf watcher below the removed path wakes', () => {
    const form = createForm({initialValues: {}});
    setValue(form, 'o', {p: 1});
    let seen = 'stale';
    subscribe(form, {
      name: 'o.p',
      scope: 'leaf',
      callback: () => {
        seen = getValue(form, 'o.p');
      }
    });
    removeField(form, 'o');
    // The leaf read falls back through the removed ancestor key, so the
    // ancestor match must wake it — the value is gone, not stuck at 1.
    expect(seen).toBeUndefined();
  });
});

describe('removeField keep options', () => {
  it('keepValue keeps the live value and its dirty baseline', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    setError(form, 'a', 'oops');
    setTouched(form, 'a');
    removeField(form, 'a', {keepValue: true});
    expect(getValue(form, 'a')).toBe('typed');
    expect(getValues(form)).toEqual({a: 'typed'});
    expect(isDirty(form)).toBe(true);
    // touched/errors clear by default.
    expect(hasTouched(form, 'a')).toBe(false);
    expect(getError(form, 'a')).toBeUndefined();
  });

  it('keepDirty implies keepValue', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    removeField(form, 'a', {keepDirty: true});
    expect(getValue(form, 'a')).toBe('typed');
    expect(isDirty(form)).toBe(true);
  });

  it('keepTouched and keepError preserve their slices', () => {
    const form = createForm();
    setValue(form, 'a', 'x');
    setError(form, 'a', 'oops');
    setTouched(form, 'a');
    removeField(form, 'a', {keepTouched: true, keepError: true});
    expect(getValue(form, 'a')).toBeUndefined();
    expect(hasTouched(form, 'a')).toBe(true);
    expect(getError(form, 'a')?.message).toBe('oops');
  });

  it('default removal is unchanged', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    removeField(form, 'a');
    expect(getValue(form, 'a')).toBeUndefined();
    expect(getValues(form)).toEqual({});
  });
});

describe('setInitialValues', () => {
  it('updates initialValues', () => {
    const form = createForm({initialValues: {a: 1}});
    setInitialValues(form, {a: 2});
    expect(form.initialValues).toEqual({a: 2});
  });

  it('does not update if same reference', () => {
    const form = createForm({initialValues: {a: 1}});
    const spy = vi.fn();
    on(form.emitter, 'change', spy);
    setInitialValues(form, form.initialValues);
    expect(spy).not.toHaveBeenCalled();
  });

  it('clears removal tombstones', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    removeField(form, 'a');
    setInitialValues(form, {a: 'updated'});
    expect(getValue(form, 'a')).toBe('updated');
    expect(getValues(form)).toEqual({a: 'updated'});
  });

  it('no-ops on an equal-content inline literal (committed edits survive)', () => {
    // The editor-page hazard: every render passes a fresh object with the
    // same content. Without the structural early return each re-render
    // cleared the values Map and reverted the user's typing.
    const form = createForm({initialValues: {a: 1, list: ['x']}});
    setValue(form, 'a', 99);
    const spy = vi.fn();
    on(form.emitter, 'change', spy);
    setInitialValues(form, {a: 1, list: ['x']});
    expect(spy).not.toHaveBeenCalled();
    expect(form.initialValues).toEqual({a: 1, list: ['x']});
    expect(getValue(form, 'a')).toBe(99);
  });

  it('keeps parsedValues when content is equal', async () => {
    // The early return must leave the schema-parse baseline intact — only
    // a genuine baseline swap drops it.
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({[VALIDATION_OUTCOME]: true, values: {a: 2}})
    });
    await ensureValidate(form);
    expect(form.parsedValues).toEqual({a: 2});
    setInitialValues(form, {a: 1});
    expect(form.parsedValues).toEqual({a: 2});
  });

  it('treats exotic objects as unequal (errs on re-seeding)', () => {
    // Class instances never compare structurally equal, so a new instance
    // re-seeds like the pre-guard behavior.
    class Box {
      constructor(v) {
        this.v = v;
      }
    }
    const form = createForm({initialValues: new Box(1)});
    const spy = vi.fn();
    on(form.emitter, 'change', spy);
    setInitialValues(form, new Box(1));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('still re-seeds and clears live values when content changed', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 99);
    setInitialValues(form, {a: 2});
    expect(getValue(form, 'a')).toBe(2);
    expect(getValues(form)).toEqual({a: 2});
  });
});

describe('reset', () => {
  it('resets all state', () => {
    const form = createForm({initialValues: {name: 'initial'}});
    setValue(form, 'name', 'changed');
    setError(form, 'name', 'error');
    setTouched(form, 'name');
    reset(form);
    // Reset without values returns fields to the current initialValues —
    // not to undefined.
    expect(getValue(form, 'name')).toBe('initial');
    expect(getValues(form)).toEqual({name: 'initial'});
    expect(getError(form, 'name')).toBeUndefined();
    expect(hasTouched(form, 'name')).toBe(false);
    expect(form.values.size).toBe(0);
  });

  it('keeps initialValues when reset receives no values', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 9);
    reset(form);
    expect(form.initialValues).toEqual({a: 1});
    expect(getValue(form, 'a')).toBe(1);
    expect(getValues(form)).toEqual({a: 1});
    // Writes after the reset still merge over the kept baseline.
    setValue(form, 'b', 2);
    expect(getValues(form)).toEqual({a: 1, b: 2});
  });

  it('keeps initialValues when reset receives only options', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 9);
    setError(form, 'a', 'error');
    reset(form, undefined, {keepErrors: true});
    expect(form.initialValues).toEqual({a: 1});
    expect(getValue(form, 'a')).toBe(1);
    expect(getValues(form)).toEqual({a: 1});
    expect(getError(form, 'a')).toEqual({type: 'custom', message: 'error'});
  });

  it('updates initialValues when provided', () => {
    const form = createForm({initialValues: {a: 1}});
    reset(form, {a: 2});
    expect(form.initialValues).toEqual({a: 2});
  });

  it('resets submission state and clears validating', () => {
    const form = createForm();
    setIsSubmitting(form, true);
    incrementSubmitCount(form);
    incrementSubmitCount(form);
    setSubmitSuccessful(form, true);
    const path = createPath('name');
    setValidatingByPath(form, path);
    reset(form);
    expect(form.isSubmitting).toBe(false);
    expect(form.submitCount).toBe(0);
    expect(form.isSubmitSuccessful).toBeUndefined();
    expect(form.validating.size).toBe(0);
  });

  it('emits validating and submission events on reset', () => {
    const form = createForm();
    incrementSubmitCount(form);
    setValidatingByPath(form, createPath('name'));
    const seen = [];
    [
      'validating',
      'submitting',
      'submitCount',
      'submitSuccessful',
      'reset'
    ].forEach(event => on(form.emitter, event, () => seen.push(event)));
    reset(form);
    expect(seen).toEqual([
      'validating',
      'submitting',
      'submitCount',
      'submitSuccessful',
      'reset'
    ]);
  });

  it('clears removal tombstones', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'typed');
    removeField(form, 'a');
    reset(form, {a: 'fresh'});
    expect(getValue(form, 'a')).toBe('fresh');
    expect(getValues(form)).toEqual({a: 'fresh'});
  });

  it('keeps dirty values with keepDirtyValues', () => {
    const form = createForm({initialValues: {a: 1, b: 2}});
    setValue(form, 'a', 9);
    reset(form, {a: 1, b: 3}, {keepDirtyValues: true});
    // `a` was dirty against the pre-reset initialValues, so its live value
    // survives; clean `b` falls back to the new initialValues.
    expect(getValue(form, 'a')).toBe(9);
    expect(getValue(form, 'b')).toBe(3);
    expect(getValues(form)).toEqual({a: 9, b: 3});
    expect(getDirtyFields(form)).toEqual({a: true});
  });

  it('keepDirtyValues leaves clean fields on the new initialValues', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 1); // stored, but equal → not dirty
    reset(form, {a: 2}, {keepDirtyValues: true});
    expect(getValue(form, 'a')).toBe(2);
    expect(isDirty(form)).toBe(false);
  });

  it('keepDirtyValues survives field names containing dots', () => {
    // A literal 'a.b' name segment is addressable through bracket syntax
    // or a segments array, never through the dotted spelling (that parses
    // as nesting). The reset snapshot must carry the structured segments.
    const form = createForm({initialValues: {}});
    setValue(form, '["a.b"]', 'typed');
    setValue(form, ['user', 'full.name'], 'nested typed');
    reset(
      form,
      {'a.b': 'fresh', user: {'full.name': 'fresh'}},
      {
        keepDirtyValues: true
      }
    );
    expect(getValue(form, ['a.b'])).toBe('typed');
    expect(getValue(form, ['user', 'full.name'])).toBe('nested typed');
    expect(getValues(form)).toEqual({
      'a.b': 'typed',
      user: {'full.name': 'nested typed'}
    });
    // The nested write must not have leaked a wrongly-parsed branch.
    expect(getValue(form, 'a')).toBeUndefined();
  });

  it('keepDirtyValues survives quoted field names', () => {
    const form = createForm({initialValues: {}});
    setValue(form, "['it\"s']", 'typed');
    reset(form, {}, {keepDirtyValues: true});
    expect(getValue(form, ['it"s'])).toBe('typed');
    expect(getValues(form)).toEqual({'it"s': 'typed'});
  });

  it('keeps touched state with keepTouched', () => {
    const form = createForm();
    setTouched(form, 'name');
    reset(form, undefined, {keepTouched: true});
    expect(hasTouched(form, 'name')).toBe(true);
    expect(isTouched(form)).toBe(true);
  });

  it('keeps errors with keepErrors', () => {
    const form = createForm();
    setError(form, 'name', 'error');
    reset(form, undefined, {keepErrors: true});
    expect(getError(form, 'name')).toEqual({type: 'custom', message: 'error'});
    expect(hasErrors(form)).toBe(true);
  });

  it('keeps submission state with keepIsSubmitted, keepIsSubmitSuccessful, keepSubmitCount and keepIsSubmitting', async () => {
    const form = createForm();
    await handleSubmit(form)();
    setIsSubmitting(form, true);
    incrementSubmitCount(form);
    reset(form, undefined, {
      keepIsSubmitted: true,
      keepIsSubmitSuccessful: true,
      keepSubmitCount: true,
      keepIsSubmitting: true
    });
    expect(form.isSubmitted).toBe(true);
    expect(form.isSubmitSuccessful).toBe(true);
    expect(form.submitCount).toBe(2);
    expect(form.isSubmitting).toBe(true);
  });

  it('isSubmitted resets unless keepIsSubmitted keeps it', async () => {
    const form = createForm();
    await handleSubmit(form)();
    expect(form.isSubmitted).toBe(true);
    reset(form);
    expect(form.isSubmitted).toBe(false);
    await handleSubmit(form)();
    reset(form, undefined, {keepIsSubmitted: true});
    expect(form.isSubmitted).toBe(true);
  });
});

describe('reset keepValues and keepDefaultValues', () => {
  it('keepValues keeps every live value through a reset with a new baseline', () => {
    const form = createForm({initialValues: {a: 'a0', b: 'b0'}});
    setValue(form, 'a', 'a1');
    setValue(form, 'b', 'b1');
    reset(form, {a: 'a2', b: 'b2'}, {keepValues: true});
    expect(getValues(form)).toEqual({a: 'a1', b: 'b1'});
    // Kept values differing from the new baseline count as dirty.
    expect(getDirtyFields(form)).toEqual({a: true, b: true});
  });

  it('keepValues with no new baseline keeps values but resets the rest', () => {
    const form = createForm({initialValues: {a: 'a0'}});
    setValue(form, 'a', 'a1');
    setError(form, 'a', 'oops');
    reset(form, undefined, {keepValues: true});
    expect(getValue(form, 'a')).toBe('a1');
    expect(getError(form, 'a')).toBeUndefined();
    expect(hasErrors(form)).toBe(false);
  });

  it('keepDirtyValues is a subset of keepValues', () => {
    const form = createForm({initialValues: {a: 'a0', b: 'b0'}});
    setValue(form, 'a', 'a1');
    reset(form, {a: 'a2', b: 'b2'}, {keepDirtyValues: true});
    expect(getValues(form)).toEqual({a: 'a1', b: 'b2'});
    reset(form, {a: 'a3', b: 'b3'}, {keepValues: true});
    expect(getValues(form)).toEqual({a: 'a1', b: 'b2'});
  });

  it('keepDefaultValues ignores a provided baseline', () => {
    const form = createForm({initialValues: {a: 'a0'}});
    setValue(form, 'a', 'a1');
    reset(form, {a: 'a2'}, {keepDefaultValues: true});
    expect(getValues(form)).toEqual({a: 'a0'});
    expect(form.initialValues).toEqual({a: 'a0'});
  });
});

describe('resetField', () => {
  it('resets the field to initialValues and leaves siblings alone', () => {
    const form = createForm({initialValues: {a: 'initial', b: 'keep'}});
    setValue(form, 'a', 'changed');
    setValue(form, 'b', 'edited');
    resetField(form, 'a');
    expect(getValue(form, 'a')).toBe('initial');
    expect(getValue(form, 'b')).toBe('edited');
    expect(form.values.size).toBe(1);
  });

  it('clears the reset field dirtiness', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 2);
    expect(getDirtyFields(form)).toEqual({a: true});
    resetField(form, 'a');
    expect(isDirty(form)).toBe(false);
    expect(getDirtyFields(form)).toEqual({});
  });

  it('value option writes an explicit value without falling back', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'changed');
    resetField(form, 'a', {value: 'explicit'});
    expect(getValue(form, 'a')).toBe('explicit');
    expect(getDirtyFields(form)).toEqual({a: true});
  });

  it('value option wins over parsedValues', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({[VALIDATION_OUTCOME]: true, values: {a: 2}})
    });
    await ensureValidate(form);
    resetField(form, 'a', {value: 3});
    expect(getValue(form, 'a')).toBe(3);
  });

  it('keepTouched preserves the touched flag', () => {
    const form = createForm({initialValues: {a: 1}});
    setTouched(form, 'a');
    resetField(form, 'a', {keepTouched: true});
    expect(hasTouched(form, 'a')).toBe(true);
    resetField(form, 'a');
    expect(hasTouched(form, 'a')).toBe(false);
  });

  it('keepErrors preserves the field errors', () => {
    const form = createForm({initialValues: {a: 1}});
    setError(form, 'a', 'bad');
    resetField(form, 'a', {keepErrors: true});
    expect(getError(form, 'a')).toEqual({type: 'custom', message: 'bad'});
    resetField(form, 'a');
    expect(getError(form, 'a')).toBeUndefined();
  });

  it('removes the path from parsedValues so it falls back to initialValues', async () => {
    const form = createForm({
      initialValues: {a: 1, b: 1},
      validate: () => ({[VALIDATION_OUTCOME]: true, values: {a: 2, b: 2}})
    });
    await ensureValidate(form);
    expect(getValue(form, 'a')).toBe(2);
    resetField(form, 'a');
    expect(form.parsedValues).toEqual({b: 2}); // path removed, not shadowed
    expect(getValue(form, 'a')).toBe(1); // falls back to initialValues
    expect(getValue(form, 'b')).toBe(2); // sibling keeps its parsed value
    expect(getValues(form)).toEqual({a: 1, b: 2});
  });

  it('revives removal tombstones (inverse of removeField)', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'changed');
    removeField(form, 'a');
    expect(getValue(form, 'a')).toBeUndefined(); // tombstone blocks fallback
    resetField(form, 'a');
    expect(getValue(form, 'a')).toBe('initial'); // tombstone revived
  });

  it('emits change payload-less like removeField', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 2);
    const changes = [];
    on(form.emitter, 'change', path => changes.push(path ?? null));
    resetField(form, 'a');
    expect(changes).toEqual([null]);
  });

  it('emits touched and errors with the field path when that state drops', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 2);
    setTouched(form, 'a');
    setError(form, 'a', 'bad');
    const events = [];
    on(form.emitter, 'touched', path => events.push(['touched', path?.key]));
    on(form.emitter, 'errors', path => events.push(['errors', path?.key]));
    resetField(form, 'a');
    expect(events).toEqual([
      ['touched', '["a"]'],
      ['errors', '["a"]']
    ]);
  });
});

describe('getFieldState', () => {
  it('aggregates value, error, errors, dirty, touched and validating', () => {
    const form = createForm({initialValues: {a: 'initial'}});
    setValue(form, 'a', 'changed');
    setError(form, 'a', ['first', 'second']);
    setTouched(form, 'a');
    setValidatingByPath(form, createPath('a'));
    expect(getFieldState(form, 'a')).toEqual({
      value: 'changed',
      error: {type: 'custom', message: 'first'},
      errors: [
        {type: 'custom', message: 'first'},
        {type: 'custom', message: 'second'}
      ],
      isDirty: true,
      isTouched: true,
      isValidating: true
    });
  });

  it('isDirty follows the getDirtyFields rule per field', () => {
    const form = createForm({initialValues: {a: 1, b: 2}});
    setValue(form, 'a', 1); // live value equal to initial: clean
    setValue(form, 'b', 3); // differs: dirty
    expect(getFieldState(form, 'a').isDirty).toBe(false);
    expect(getFieldState(form, 'b').isDirty).toBe(true);
    expect(getFieldState(form, 'missing').isDirty).toBe(false);
    expect(getDirtyFields(form)).toEqual({b: true});
  });

  it('isDirty compares against initialValues even when parsedValues differ', async () => {
    const form = createForm({
      initialValues: {a: 1},
      validate: () => ({[VALIDATION_OUTCOME]: true, values: {a: 2}})
    });
    await ensureValidate(form);
    const state = getFieldState(form, 'a');
    expect(state.value).toBe(2); // layered read sees the parsed value
    expect(state.isDirty).toBe(false); // parsing is not an edit
  });

  it('errors is the shared stored array, read-only by contract', () => {
    const form = createForm();
    setError(form, 'a', 'bad');
    expect(getFieldState(form, 'a').errors).toBe(getFieldErrors(form, 'a'));
    expect(getFieldState(form, 'missing').errors).toEqual([]);
  });
});
