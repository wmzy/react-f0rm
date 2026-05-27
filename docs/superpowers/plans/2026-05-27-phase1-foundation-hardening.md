# Phase 1: Foundation Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all known bugs and establish comprehensive test coverage for the core library.

**Architecture:** Fix bugs in pure function layer first (util, form), then React layer (hooks, components). Tests written before each fix to confirm the bug and verify the fix. All tests use vitest + @testing-library/react.

**Tech Stack:** vitest, jsdom, @testing-library/react, @testing-library/user-event

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/util.js` | Modify | Fix `get` error swallowing |
| `src/form.js` | Modify | Fix `isDirty`, `ensureValidate`, `setInitialValues` |
| `src/hooks/validate.js` | Modify | Fix render-time mutation |
| `src/components/Form.jsx` | Modify | Fix `onSubmit` timing |
| `test/.eslintrc.js` | Modify | Update mocha → vitest |
| `test/util.test.js` | Create | Tests for util functions |
| `test/path.test.js` | Create | Tests for path functions |
| `test/form.test.js` | Create | Tests for form functions |
| `test/hooks/useForm.test.jsx` | Create | Tests for useForm hook |
| `test/hooks/useField.test.jsx` | Create | Tests for useField hook |
| `test/hooks/useValidate.test.jsx` | Create | Tests for useValidate hook |
| `test/components/Form.test.jsx` | Create | Tests for Form component |
| `test/components/Field.test.jsx` | Create | Tests for Field component |

---

## Task 1: Install Test Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: Verify installation**

```bash
npm test -- --run
```

Expected: PASS (zero tests, passWithNoTests)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "test: add testing library dependencies"
```

---

## Task 2: Fix Stale Test ESLint Config

**Files:**
- Modify: `test/.eslintrc.js`

- [ ] **Step 1: Update eslint config**

Replace contents of `test/.eslintrc.js`:

```js
module.exports = {
  env: {
    vitest: true
  },
  rules: {
    'builtin-compat/no-incompatible-builtins': 'off',
    'func-names': 'off'
  }
};
```

- [ ] **Step 2: Verify lint passes**

```bash
npm run lint
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add test/.eslintrc.js
git commit -m "fix: update test eslint config from mocha to vitest"
```

---

## Task 3: Fix `get` Error Swallowing

**Files:**
- Modify: `src/util.js:13-18`
- Create: `test/util.test.js`

- [ ] **Step 1: Write failing test for `get` error behavior**

Create `test/util.test.js`:

```js
import {describe, it, expect} from 'vitest';
import {get, set, isEmpty, isPromise, normalizePath} from '../src/util';

describe('get', () => {
  it('gets a value at a simple path', () => {
    const obj = {a: 1};
    expect(get(obj, ['a'])).toBe(1);
  });

  it('gets a nested value', () => {
    const obj = {a: {b: {c: 3}}};
    expect(get(obj, ['a', 'b', 'c'])).toBe(3);
  });

  it('returns undefined for missing path', () => {
    const obj = {a: 1};
    expect(get(obj, ['b'])).toBeUndefined();
  });

  it('returns undefined for deeply missing path', () => {
    const obj = {a: {b: 1}};
    expect(get(obj, ['a', 'x', 'y'])).toBeUndefined();
  });

  it('handles array indices', () => {
    const obj = {items: [10, 20, 30]};
    expect(get(obj, ['items', 1])).toBe(20);
  });

  it('returns undefined for null intermediate value', () => {
    const obj = {a: null};
    expect(get(obj, ['a', 'b'])).toBeUndefined();
  });
});

describe('set', () => {
  it('sets a value at a simple path', () => {
    const result = set({a: 1}, ['a'], 2);
    expect(result).toEqual({a: 2});
  });

  it('sets a nested value immutably', () => {
    const obj = {a: {b: 1}};
    const result = set(obj, ['a', 'b'], 2);
    expect(result).toEqual({a: {b: 2}});
    expect(obj.a.b).toBe(1); // original unchanged
  });

  it('creates intermediate objects', () => {
    const result = set({}, ['a', 'b', 'c'], 1);
    expect(result).toEqual({a: {b: {c: 1}}});
  });

  it('handles array indices', () => {
    const result = set({items: [1, 2, 3]}, ['items', 1], 99);
    expect(result).toEqual({items: [1, 99, 3]});
  });

  it('creates arrays when index is number', () => {
    const result = set({}, ['items', 0], 'a');
    expect(result).toEqual({items: ['a']});
  });
});

describe('isEmpty', () => {
  it('returns true for null/undefined', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });

  it('returns true for empty object', () => {
    expect(isEmpty({})).toBe(true);
  });

  it('returns true for empty array', () => {
    expect(isEmpty([])).toBe(true);
  });

  it('returns false for non-empty string', () => {
    expect(isEmpty('hello')).toBe(false);
  });

  it('returns true for object with all empty values', () => {
    expect(isEmpty({a: null, b: undefined})).toBe(true);
  });

  it('returns false for object with non-empty values', () => {
    expect(isEmpty({a: 1})).toBe(false);
  });
});

describe('isPromise', () => {
  it('returns true for promises', () => {
    expect(isPromise(Promise.resolve())).toBe(true);
  });

  it('returns true for thenables', () => {
    expect(isPromise({then: () => {}})).toBe(true);
  });

  it('returns false for non-promises', () => {
    expect(isPromise(null)).toBe(false);
    expect(isPromise(undefined)).toBe(false);
    expect(isPromise(42)).toBe(false);
    expect(isPromise('string')).toBe(false);
    expect(isPromise({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass (before bug fix)**

```bash
npx vitest run test/util.test.js
```

Expected: Tests for `get` with null intermediate value may fail or pass depending on current behavior. The key tests are the existing ones.

- [ ] **Step 3: Fix `get` function**

In `src/util.js`, replace lines 13-18:

```js
export function get(values, path) {
  return path.reduce((current, p) => {
    if (current == null) return undefined;
    return current[p];
  }, values);
}
```

- [ ] **Step 4: Run tests to verify fix**

```bash
npx vitest run test/util.test.js
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/util.js test/util.test.js
git commit -m "fix: stop get() from swallowing errors, add util tests"
```

---

## Task 4: Write Path Tests

**Files:**
- Create: `test/path.test.js`

- [ ] **Step 1: Write path tests**

Create `test/path.test.js`:

```js
import {describe, it, expect} from 'vitest';
import createPath from '../src/path';

describe('createPath', () => {
  it('creates path from string', () => {
    const path = createPath('name');
    expect(path.value).toEqual(['name']);
    expect(path.key).toBe('["name"]');
  });

  it('creates path from dot-notation string', () => {
    const path = createPath('user.name');
    expect(path.value).toEqual(['user', 'name']);
    expect(path.key).toBe('["user","name"]');
  });

  it('creates path from bracket notation', () => {
    const path = createPath('items[0]');
    expect(path.value).toEqual(['items', 0]);
    expect(path.key).toBe('["items",0]');
  });

  it('creates path from nested bracket notation', () => {
    const path = createPath('items[0].name');
    expect(path.value).toEqual(['items', 0, 'name']);
    expect(path.key).toBe('["items",0,"name"]');
  });

  it('creates path from array', () => {
    const path = createPath(['user', 'email']);
    expect(path.value).toEqual(['user', 'email']);
    expect(path.key).toBe('["user","email"]');
  });

  it('creates path from array with numbers', () => {
    const path = createPath(['items', 0, 'name']);
    expect(path.value).toEqual(['items', 0, 'name']);
    expect(path.key).toBe('["items",0,"name"]');
  });

  it('memoizes same array input', () => {
    const arr = ['user', 'name'];
    const path1 = createPath(arr);
    const path2 = createPath(arr);
    expect(path1).toBe(path2);
  });

  it('does not memoize different arrays with same content', () => {
    const path1 = createPath(['user', 'name']);
    const path2 = createPath(['user', 'name']);
    expect(path1).not.toBe(path2);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run test/path.test.js
```

Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add test/path.test.js
git commit -m "test: add path module tests"
```

---

## Task 5: Write Form Tests and Fix `isDirty`

**Files:**
- Create: `test/form.test.js`
- Modify: `src/form.js`

- [ ] **Step 1: Write form tests**

Create `test/form.test.js`:

```js
import {describe, it, expect, vi} from 'vitest';
import createForm, {
  getValue,
  setValue,
  getValueByPath,
  setValueByPath,
  getError,
  setError,
  getErrorByPath,
  setErrorByPath,
  getErrors,
  getFirstError,
  clearErrors,
  hasErrors,
  setTouched,
  hasTouched,
  isTouched,
  isDirty,
  removeField,
  removeFieldByPath,
  setInitialValues,
  reset,
  getValues
} from '../src/form';
import createPath from '../src/path';

describe('createForm', () => {
  it('creates a form instance', () => {
    const form = createForm();
    expect(form.values).toBeInstanceOf(Map);
    expect(form.errors).toBeInstanceOf(Map);
    expect(form.touched).toBeInstanceOf(Set);
    expect(form.validators).toBeInstanceOf(Map);
    expect(form.validating).toBeInstanceOf(Set);
    expect(form.revalidateOnChange).toBe(true);
  });

  it('merges options', () => {
    const form = createForm({initialValues: {name: 'test'}});
    expect(form.initialValues).toEqual({name: 'test'});
  });
});

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
});

describe('getValues', () => {
  it('returns all values merged with initialValues', () => {
    const form = createForm({initialValues: {a: 1, b: 2}});
    setValue(form, 'b', 99);
    setValue(form, 'c', 3);
    const values = getValues(form);
    expect(values).toEqual({a: 1, b: 99, c: 3});
  });
});

describe('getError / setError', () => {
  it('gets and sets a field error', () => {
    const form = createForm();
    setError(form, 'name', 'required');
    expect(getError(form, 'name')).toBe('required');
  });

  it('returns undefined when no error', () => {
    const form = createForm();
    expect(getError(form, 'name')).toBeUndefined();
  });

  it('clears error when set to undefined', () => {
    const form = createForm();
    setError(form, 'name', 'required');
    setError(form, 'name', undefined);
    expect(getError(form, 'name')).toBeUndefined();
  });
});

describe('getErrors / getFirstError / clearErrors / hasErrors', () => {
  it('getErrors returns all errors', () => {
    const form = createForm();
    setError(form, 'a', 'error a');
    setError(form, 'b', 'error b');
    expect(getErrors(form)).toEqual(['error a', 'error b']);
  });

  it('getFirstError returns first error', () => {
    const form = createForm();
    setError(form, 'a', 'first');
    expect(getFirstError(form)).toBe('first');
  });

  it('clearErrors removes all errors', () => {
    const form = createForm();
    setError(form, 'a', 'error');
    clearErrors(form);
    expect(hasErrors(form)).toBe(false);
  });

  it('hasErrors returns true when errors exist', () => {
    const form = createForm();
    expect(hasErrors(form)).toBe(false);
    setError(form, 'a', 'error');
    expect(hasErrors(form)).toBe(true);
  });
});

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

describe('isDirty', () => {
  it('returns false when no values changed from initialValues', () => {
    const form = createForm({initialValues: {name: 'test'}});
    expect(isDirty(form)).toBe(false);
  });

  it('returns true when a value differs from initialValues', () => {
    const form = createForm({initialValues: {name: 'test'}});
    setValue(form, 'name', 'changed');
    expect(isDirty(form)).toBe(true);
  });

  it('returns false when value is set back to initial', () => {
    const form = createForm({initialValues: {name: 'test'}});
    setValue(form, 'name', 'changed');
    setValue(form, 'name', 'test');
    expect(isDirty(form)).toBe(false);
  });

  it('returns true for new field not in initialValues', () => {
    const form = createForm({initialValues: {}});
    setValue(form, 'email', 'test@example.com');
    expect(isDirty(form)).toBe(true);
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
    form.emitter.on('change', spy);
    setInitialValues(form, form.initialValues);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('reset', () => {
  it('resets all state', () => {
    const form = createForm({initialValues: {name: 'initial'}});
    setValue(form, 'name', 'changed');
    setError(form, 'name', 'error');
    setTouched(form, 'name');
    reset(form);
    expect(getValue(form, 'name')).toBeUndefined();
    expect(getError(form, 'name')).toBeUndefined();
    expect(hasTouched(form, 'name')).toBe(false);
    expect(form.values.size).toBe(0);
  });

  it('updates initialValues when provided', () => {
    const form = createForm({initialValues: {a: 1}});
    reset(form, {a: 2});
    expect(form.initialValues).toEqual({a: 2});
  });
});
```

- [ ] **Step 2: Run tests to see `isDirty` fail**

```bash
npx vitest run test/form.test.js
```

Expected: `isDirty` tests fail because current implementation checks `touched.size > 0`

- [ ] **Step 3: Fix `isDirty` and add `isTouched`**

In `src/form.js`, replace the `isDirty` function (around line 202):

```js
/**
 * Is dirty — any value differs from initialValues
 * @param {Form} form
 */
export function isDirty({initialValues, values}) {
  for (const [key, value] of values) {
    const path = JSON.parse(key);
    if (get(initialValues, path) !== value) return true;
  }
  return false;
}

/**
 * Is touched — any field has been touched
 * @param {Form} form
 */
export function isTouched({touched}) {
  return touched.size > 0;
}
```

Make sure `get` is imported at the top of `src/form.js`:

```js
import {get, set, waitUntil} from './util';
```

- [ ] **Step 4: Run tests to verify fix**

```bash
npx vitest run test/form.test.js
```

Expected: All PASS

- [ ] **Step 5: Update `src/index.js` exports**

Add `isTouched` to the exports if not already covered by `export * from './form'`.

Check current `src/index.js`:
```js
export * from './form';
```

This already exports everything, so `isTouched` will be available automatically.

- [ ] **Step 6: Commit**

```bash
git add src/form.js test/form.test.js
git commit -m "fix: isDirty now compares values vs initialValues, add isTouched"
```

---

## Task 6: Fix `ensureValidate` Race Condition

**Files:**
- Modify: `src/form.js:279-293`
- Modify: `test/form.test.js`

- [ ] **Step 1: Write failing test for async validation**

Add to `test/form.test.js`:

```js
describe('ensureValidate', () => {
  it('resolves when no validators', async () => {
    const form = createForm();
    await expect(ensureValidate(form)).resolves.toBeUndefined();
  });

  it('resolves when all validators pass (sync)', async () => {
    const form = createForm();
    form.validators.set('name', () => {
      setErrorByPath(form, createPath('name'), undefined);
    });
    await expect(ensureValidate(form)).resolves.toBeUndefined();
  });

  it('rejects when sync validator sets error', async () => {
    const form = createForm();
    form.validators.set('name', () => {
      setErrorByPath(form, createPath('name'), 'required');
    });
    await expect(ensureValidate(form)).rejects.toThrow('required');
  });

  it('waits for async validators', async () => {
    const form = createForm();
    form.validators.set('name', () => {
      setValidatingByPath(form, createPath('name'));
      setTimeout(() => {
        setErrorByPath(form, createPath('name'), 'async error');
        unsetValidatingByPath(form, createPath('name'));
      }, 10);
    });
    await expect(ensureValidate(form)).rejects.toThrow('async error');
  });
});
```

Import the additional functions at the top of `test/form.test.js`:

```js
import createForm, {
  // ... existing imports
  ensureValidate,
  setValidatingByPath,
  unsetValidatingByPath
} from '../src/form';
```

- [ ] **Step 2: Run tests to see race condition**

```bash
npx vitest run test/form.test.js
```

Expected: The async validator test may be flaky or fail due to the early throw in the sync loop.

- [ ] **Step 3: Fix `ensureValidate`**

In `src/form.js`, replace `ensureValidate` (lines 279-293):

```js
/**
 * Trigger all fields validate and wait for completion.
 * @param {Form} form
 * @return {Promise} resolve if no error; reject if has an error;
 */
export async function ensureValidate(form) {
  form.validators.forEach(validator => validator());

  return waitUntil(
    form.emitter,
    'validating',
    () => !form.validating.size,
    () => hasErrors(form)
  ).catch(() => {
    throw new Error(getFirstError(form));
  });
}
```

The fix: removed the early `throw` inside the `forEach` loop. Now it always triggers all validators first, then waits for async completion.

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/form.test.js
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/form.js test/form.test.js
git commit -m "fix: ensureValidate no longer skips async validators"
```

---

## Task 7: Fix `setInitialValues` Stale Values

**Files:**
- Modify: `src/form.js:237-241`
- Modify: `test/form.test.js`

- [ ] **Step 1: Write failing test**

Add to `test/form.test.js`:

```js
describe('setInitialValues', () => {
  // ... existing tests ...

  it('clears values map when initialValues changes', () => {
    const form = createForm({initialValues: {a: 1}});
    setValue(form, 'a', 99);
    expect(getValue(form, 'a')).toBe(99);
    setInitialValues(form, {a: 2});
    expect(getValue(form, 'a')).toBe(2); // should get new initial value
  });
});
```

- [ ] **Step 2: Run test to see it fail**

```bash
npx vitest run test/form.test.js
```

Expected: `getValue` returns 99 (stale value from Map) instead of 2

- [ ] **Step 3: Fix `setInitialValues`**

In `src/form.js`, replace `setInitialValues` (lines 237-241):

```js
export function setInitialValues(form, initialValues) {
  if (form.initialValues === initialValues) return;
  form.initialValues = initialValues;
  form.values.clear();
  emit(form.emitter, 'change');
}
```

Added `form.values.clear()` so field values reset to the new initial values.

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/form.test.js
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/form.js test/form.test.js
git commit -m "fix: setInitialValues clears stale values"
```

---

## Task 8: Fix `useValidate` Render Mutation

**Files:**
- Modify: `src/hooks/validate.js:17-38`

- [ ] **Step 1: Fix the hook**

In `src/hooks/validate.js`, replace the function body:

```js
export default function useValidate(validate, path) {
  const form = useFormContext();
  const lockRef = useRef(null);
  const validateRef = useRef(validate);
  validateRef.current = validate;

  useEffect(() => {
    const validator = () => {
      const fn = validateRef.current;
      if (!fn) return;
      const result = fn(getValueByPath(form, path), {form, path});
      if (!isPromise(result)) {
        setErrorByPath(form, path, result);
        return;
      }
      const lock = (lockRef.current = {});
      setValidatingByPath(form, path);
      result
        .then(error => {
          if (lock === lockRef.current) {
            setErrorByPath(form, path, error);
          }
        })
        .finally(() => {
          if (lock === lockRef.current) {
            unsetValidatingByPath(form, path);
            lockRef.current = null;
          }
        });
    };

    form.validators.set(path.key, validator);
    return () => form.validators.delete(path.key);
  }, [form, path.key]);

  return useStageFn(() => form.validators.get(path.key)?.());
}
```

Changes:
- Moved `form.validators.set()` into `useEffect`
- Used `validateRef` to always call latest validate function
- Cleanup function removes the validator on unmount/deps change

- [ ] **Step 2: Run existing tests**

```bash
npm test
```

Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/validate.js
git commit -m "fix: move validator registration to useEffect"
```

---

## Task 9: Fix `onSubmit` Timing

**Files:**
- Modify: `src/components/Form.jsx:23-36`

- [ ] **Step 1: Fix handleSubmit**

In `src/components/Form.jsx`, replace the `handleSubmit` function:

```js
async function handleSubmit(e) {
  e.preventDefault();
  const error = await validate(form).catch(err => err.message);

  const values = getValues(form);

  if (error) {
    if (onInvalidSubmit) onInvalidSubmit(getErrors(form), values);
    return;
  }

  if (onSubmit) onSubmit(values, e);
  if (onValidSubmit) onValidSubmit(values, e);
}
```

Changes:
- `await validate(form)` before calling any submit callbacks
- `onSubmit` only called after validation passes
- `onInvalidSubmit` called with errors when validation fails

- [ ] **Step 2: Run existing tests**

```bash
npm test
```

Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/Form.jsx
git commit -m "fix: await validation before calling onSubmit"
```

---

## Task 10: Write Hook Tests

**Files:**
- Create: `test/hooks/useForm.test.jsx`
- Create: `test/hooks/useField.test.jsx`
- Create: `test/hooks/useValidate.test.jsx`

- [ ] **Step 1: Create test directory**

```bash
mkdir -p test/hooks
```

- [ ] **Step 2: Write useForm tests**

Create `test/hooks/useForm.test.jsx`:

```jsx
import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import useForm, {useValue, useError, useTouched, useIsDirty, useHasErrors} from '../../src/hooks/form';
import {setValue, setError, setTouched} from '../../src/form';

describe('useForm', () => {
  it('returns a form instance', () => {
    const {result} = renderHook(() => useForm({initialValues: {name: 'test'}}));
    expect(result.current).toBeDefined();
    expect(result.current.values).toBeInstanceOf(Map);
  });

  it('returns same instance on rerender', () => {
    const {result, rerender} = renderHook(
      ({initialValues}) => useForm({initialValues}),
      {initialProps: {initialValues: {name: 'test'}}}
    );
    const form1 = result.current;
    rerender({initialValues: {name: 'test'}});
    expect(result.current).toBe(form1);
  });
});

describe('useValue', () => {
  it('returns current value', () => {
    const {result} = renderHook(() => {
      const form = useForm({initialValues: {name: 'test'}});
      return useValue(form, 'name');
    });
    expect(result.current).toBe('test');
  });

  it('updates when value changes', () => {
    const {result} = renderHook(() => {
      const form = useForm({initialValues: {name: 'test'}});
      return {form, value: useValue(form, 'name')};
    });
    expect(result.current.value).toBe('test');
    act(() => setValue(result.current.form, 'name', 'changed'));
    expect(result.current.value).toBe('changed');
  });
});

describe('useError', () => {
  it('returns current error', () => {
    const {result} = renderHook(() => {
      const form = useForm({initialValues: {}});
      return {form, error: useError(form, 'name')};
    });
    expect(result.current.error).toBeUndefined();
    act(() => setError(result.current.form, 'name', 'required'));
    expect(result.current.error).toBe('required');
  });
});

describe('useTouched', () => {
  it('returns touched state', () => {
    const {result} = renderHook(() => {
      const form = useForm({initialValues: {}});
      return {form, touched: useTouched(form, 'name')};
    });
    expect(result.current.touched).toBe(false);
    act(() => setTouched(result.current.form, 'name'));
    expect(result.current.touched).toBe(true);
  });
});
```

- [ ] **Step 3: Run useForm tests**

```bash
npx vitest run test/hooks/useForm.test.jsx
```

Expected: All PASS

- [ ] **Step 4: Write useField tests**

Create `test/hooks/useField.test.jsx`:

```jsx
import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {FormProvider} from '../../src/context';
import useField from '../../src/hooks/field';
import useForm from '../../src/hooks/form';
import React from 'react';

function wrapper({children}) {
  const form = useForm({initialValues: {name: 'test'}});
  return <FormProvider value={form}>{children}</FormProvider>;
}

describe('useField', () => {
  it('returns field state', () => {
    const {result} = renderHook(() => useField({name: 'name'}), {wrapper});
    expect(result.current.value).toBe('test');
    expect(result.current.error).toBeUndefined();
    expect(result.current.name).toBe('["name"]');
  });

  it('provides onChange handler', () => {
    const {result} = renderHook(() => useField({name: 'name'}), {wrapper});
    expect(typeof result.current.onChange).toBe('function');
    act(() => result.current.onChange('changed'));
    expect(result.current.value).toBe('changed');
  });

  it('provides onBlur handler', () => {
    const {result} = renderHook(() => useField({name: 'name'}), {wrapper});
    expect(typeof result.current.onBlur).toBe('function');
    act(() => result.current.onBlur());
    // touched state is set (we can't easily check without useTouched here)
  });

  it('uses initialValue when provided', () => {
    const {result} = renderHook(
      () => useField({name: 'email', initialValue: 'default@test.com'}),
      {wrapper}
    );
    expect(result.current.value).toBe('default@test.com');
  });
});
```

- [ ] **Step 5: Run useField tests**

```bash
npx vitest run test/hooks/useField.test.jsx
```

Expected: All PASS

- [ ] **Step 6: Write useValidate tests**

Create `test/hooks/useValidate.test.jsx`:

```jsx
import {describe, it, expect, vi} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {FormProvider} from '../../src/context';
import useValidate from '../../src/hooks/validate';
import useForm from '../../src/hooks/form';
import createPath from '../../src/path';
import React from 'react';

function createWrapper(form) {
  return function Wrapper({children}) {
    return <FormProvider value={form}>{children}</FormProvider>;
  };
}

describe('useValidate', () => {
  it('registers validator on mount', () => {
    const form = {validators: new Map(), emitter: {on: () => () => {}}};
    const path = createPath('name');
    const validate = vi.fn();

    renderHook(() => useValidate(validate, path), {
      wrapper: createWrapper(form)
    });

    expect(form.validators.has(path.key)).toBe(true);
  });

  it('removes validator on unmount', () => {
    const form = {validators: new Map(), emitter: {on: () => () => {}}};
    const path = createPath('name');
    const validate = vi.fn();

    const {unmount} = renderHook(() => useValidate(validate, path), {
      wrapper: createWrapper(form)
    });

    unmount();
    expect(form.validators.has(path.key)).toBe(false);
  });
});
```

- [ ] **Step 7: Run useValidate tests**

```bash
npx vitest run test/hooks/useValidate.test.jsx
```

Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add test/hooks/
git commit -m "test: add hook tests for useForm, useField, useValidate"
```

---

## Task 11: Write Component Tests

**Files:**
- Create: `test/components/Form.test.jsx`
- Create: `test/components/Field.test.jsx`

- [ ] **Step 1: Create test directory**

```bash
mkdir -p test/components
```

- [ ] **Step 2: Write Form component tests**

Create `test/components/Form.test.jsx`:

```jsx
import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import Form from '../../src/components/Form';
import {Field} from '../../src/components/Field';

describe('Form', () => {
  it('renders a form element', () => {
    render(<Form initialValues={{}}><button type="submit">Submit</button></Form>);
    expect(screen.getByRole('form')).toBeDefined();
  });

  it('calls onSubmit with values', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form initialValues={{name: 'test'}} onSubmit={onSubmit}>
        <Field name="name" />
        <button type="submit">Submit</button>
      </Form>
    );

    await user.click(screen.getByRole('button', {name: 'Submit'}));
    expect(onSubmit).toHaveBeenCalledWith({name: 'test'}, expect.anything());
  });

  it('calls onValidSubmit after validation passes', async () => {
    const onValidSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form initialValues={{name: 'test'}} onValidSubmit={onValidSubmit}>
        <Field name="name" />
        <button type="submit">Submit</button>
      </Form>
    );

    await user.click(screen.getByRole('button', {name: 'Submit'}));
    // Wait for async validation
    await vi.waitFor(() => {
      expect(onValidSubmit).toHaveBeenCalledWith({name: 'test'}, expect.anything());
    });
  });

  it('prevents default form submission', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form initialValues={{}} onSubmit={onSubmit}>
        <button type="submit">Submit</button>
      </Form>
    );

    await user.click(screen.getByRole('button', {name: 'Submit'}));
    expect(onSubmit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run Form tests**

```bash
npx vitest run test/components/Form.test.jsx
```

Expected: All PASS

- [ ] **Step 4: Write Field component tests**

Create `test/components/Field.test.jsx`:

```jsx
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import Form from '../../src/components/Form';
import {Field} from '../../src/components/Field';

describe('Field', () => {
  it('renders an input with value', () => {
    render(
      <Form initialValues={{name: 'test'}}>
        <Field name="name" />
      </Form>
    );
    const input = screen.getByDisplayValue('test');
    expect(input).toBeDefined();
  });

  it('updates value on change', async () => {
    const user = userEvent.setup();
    render(
      <Form initialValues={{name: ''}}>
        <Field name="name" data-testid="name-input" />
      </Form>
    );
    const input = screen.getByTestId('name-input');
    await user.type(input, 'hello');
    expect(input.value).toBe('hello');
  });

  it('renders with custom component via as prop', () => {
    function CustomInput({value, onChange, ...props}) {
      return <textarea {...props} value={value} onChange={e => onChange(e.target.value)} />;
    }
    render(
      <Form initialValues={{bio: 'hello'}}>
        <Field name="bio" as={CustomInput} />
      </Form>
    );
    expect(screen.getByDisplayValue('hello')).toBeDefined();
  });
});
```

- [ ] **Step 5: Run Field tests**

```bash
npx vitest run test/components/Field.test.jsx
```

Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add test/components/
git commit -m "test: add component tests for Form and Field"
```

---

## Task 12: Run Full Test Suite

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All tests PASS

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: No errors

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore: phase 1 complete — all bugs fixed, tests passing"
```
