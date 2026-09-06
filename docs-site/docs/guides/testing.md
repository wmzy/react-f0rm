# Testing

react-f0rm keeps all state in a plain form object outside React's tree, so tests exercise the same public surface the app does: render components, fire events, read the getters. No test mode, nothing to mock.

## Rendering and Typing

Build the form inline with `createForm` (or `useForm` inside a harness component), render, and drive inputs with `fireEvent` wrapped in `await act(async () => …)` so React flushes the updates each interaction schedules:

```tsx
import {render, screen, fireEvent, act} from '@testing-library/react';
import {createForm, useField} from 'react-f0rm';

function EmailField({form, debounce}) {
  const {value, onChange, error} = useField({
    form,
    name: 'email',
    validateDebounce: debounce,
    validate: v => (v.includes('@') ? undefined : 'Invalid email'),
  });
  return (
    <div>
      <input
        data-testid='email'
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {error && <span role='alert'>{error}</span>}
    </div>
  );
}

it('accepts input and surfaces the error', async () => {
  const form = createForm({initialValues: {email: ''}, mode: 'onChange'});
  render(<EmailField form={form} />);

  const input = screen.getByTestId('email');
  await act(async () => {
    fireEvent.change(input, {target: {value: 'nope'}});
  });
  expect(input.value).toBe('nope');
  expect(screen.getByRole('alert').textContent).toBe('Invalid email');
});
```

`user-event` drives the same components; its helpers flush their own `act`, so no extra wrapper is needed:

```tsx
const user = userEvent.setup();
await user.type(screen.getByTestId('email'), 'ada@lovelace.dev');
expect(screen.queryByRole('alert')).toBeNull();
```

## Validating on Demand

`trigger` runs the validators and resolves only when the round has settled — async validators and pending debounce windows included — so `await` it before asserting on error state:

```tsx
import {trigger, getError, getFieldErrors} from 'react-f0rm';

const form = createForm({initialValues: {email: 'nope'}});
render(<EmailField form={form} />);

expect(await trigger(form, 'email')).toBe(false);
expect(getFieldErrors(form, 'email')).toEqual([
  {type: 'custom', message: 'Invalid email'},
]);

// Fix the field, re-run the round:
await act(async () => {
  fireEvent.change(screen.getByTestId('email'), {target: {value: 'ada@lovelace.dev'}});
});
expect(await trigger(form, 'email')).toBe(true);
expect(getError(form, 'email')).toBeUndefined();
```

The getters are synchronous state reads, so they assert right after the `await` with no `waitFor`. With `name` the scope is that field only and the form-level `validate` is skipped (RHF semantics).

## Debounced Validation Under Fake Timers

A `validateDebounce` window is a plain `setTimeout` — under `vi.useFakeTimers()` you advance it yourself:

```tsx
vi.useFakeTimers();

const form = createForm({initialValues: {email: ''}, mode: 'onChange'});
render(<EmailField form={form} debounce={300} />);
const input = screen.getByTestId('email');

await act(async () => {
  fireEvent.change(input, {target: {value: 'nope'}});
});
expect(getError(form, 'email')).toBeUndefined(); // window still pending

await act(async () => {
  await vi.advanceTimersByTimeAsync(300); // fire the debounced kick
});
expect(getError(form, 'email')).toEqual({type: 'custom', message: 'Invalid email'});
```

Use `advanceTimersByTimeAsync` (not `advanceTimersByTime`) so the microtasks an async validator chains after the timer flush too. Restore real timers when the test ends — `afterEach(() => vi.useRealTimers())` — or the next test's `vi.waitFor` never fires. With real timers you can skip clock control entirely: `await trigger(form)` waits the window out itself.

## Submitting

`handleSubmit` returns the submit handler; call it directly, wrapped in `await act`, and assert both routes through `onValidSubmit`/`onInvalidSubmit` spies:

```tsx
import {handleSubmit} from 'react-f0rm';

const onValidSubmit = vi.fn();
const onInvalidSubmit = vi.fn();
const submit = handleSubmit(form, {onValidSubmit, onInvalidSubmit});

await act(async () => {
  await submit(); // 'email' still holds 'nope'
});
expect(onValidSubmit).not.toHaveBeenCalled();
expect(onInvalidSubmit).toHaveBeenCalledTimes(1);
expect(onInvalidSubmit.mock.calls[0][0]).toEqual([
  {path: 'email', type: 'custom', message: 'Invalid email'},
]);

await act(async () => {
  fireEvent.change(screen.getByTestId('email'), {target: {value: 'ada@lovelace.dev'}});
});
await act(async () => {
  await submit();
});
expect(onValidSubmit).toHaveBeenCalledTimes(1);
expect(onValidSubmit.mock.calls[0][0]).toEqual({email: 'ada@lovelace.dev'});
```

A rejected `onSubmit`/`onValidSubmit` is swallowed into `isSubmitSuccessful: false`, never rethrown — so land server responses deliberately and assert them back on the form:

```tsx
import {setServerErrors, FORM_ERROR} from 'react-f0rm';

const submit = handleSubmit(form, {
  onSubmit: async () => {
    try {
      await save();
    } catch (e) {
      setServerErrors(form, e.data.errors);
    }
  },
});

await act(async () => {
  await submit();
});
expect(getError(form, 'email')).toEqual({type: 'server', message: 'has already been taken'});
expect(getError(form, FORM_ERROR)).toEqual({type: 'server', message: 'Registration failed'});
```

In components the reactive twins read the same state: `useError(form, 'email')` for a field, `useFormError(form)` for the form-level slot (`FORM_ERROR`).

## jsdom Notes

- **Focus** — jsdom implements `focus()`, so `setFocus` and the failed-submit auto-focus assert through `document.activeElement`: `expect(document.activeElement).toBe(input)`. `HTMLInputElement.select()` is a no-op stub in jsdom — there is no rendered selection to assert; assert focus and value instead.
- **Assert through the public getters, not the internals.** The form object's Maps (`values`, `errors`, `validating`) are private plumbing whose shape can change; `getValue`/`getValues`, `getError`/`getFieldErrors`/`getErrors`, `hasTouched`, `isDirty` and the `use*` hooks are the contract your tests should pin.
- **Rendered output after async work** — when asserting DOM (not getters) after an async submit, give React a beat with `vi.waitFor(() => expect(…))`; for plain events the `await act(async () => …)` wrapper already covers it.
