# Submission Handling

## Submit Callbacks

```tsx
<Form
  initialValues={{ name: '' }}
  onSubmit={(values) => console.log('Submitted:', values)}
  onValidSubmit={(values) => saveToAPI(values)}
  onInvalidSubmit={(errors, values) => showErrors(errors)}
>
```

`onInvalidSubmit` receives `(errors, values)` where `errors` is a flattened array of `{path, type, message}` entries in insertion order — `path` is the dotted field path (`'a.b'`, `'list.0'`), `type` the error kind (`'custom'` for plain string errors), `message` the display text.

## Native Validation Gate

`<Form>` always renders its `<form>` with `noValidate`, suppressing the browser's built-in blocked-submit UI — but native constraint validation still gates submission:

1. On submit, the form element's `checkValidity()` runs **before** custom validators.
2. If a native constraint fails (`required`, `type=email`, `minLength`, …), `reportValidity()` surfaces the offending constraint as a native bubble, `onInvalidSubmit` fires, and submission stops.
3. `onSubmit` / `onValidSubmit` only run once every native constraint passes *and* custom validation succeeds.

`Field` components also push their custom error message into the input via `setCustomValidity`, so custom errors surface through the same native bubble UI.

## Submission State

```tsx
import { useFormContext, useIsSubmitting, useSubmitCount } from 'react-f0rm';

function SubmitButton() {
  const form = useFormContext();
  const isSubmitting = useIsSubmitting(form);
  const submitCount = useSubmitCount(form);

  return (
    <button type='submit' disabled={isSubmitting}>
      {isSubmitting ? 'Saving...' : `Save (attempt #${submitCount + 1})`}
    </button>
  );
}
```

`reset(form)` clears the submission state too: `isSubmitting` → `false`, `submitCount` → `0`, `isSubmitSuccessful` → `undefined` (along with values, errors, touched and validating state).
