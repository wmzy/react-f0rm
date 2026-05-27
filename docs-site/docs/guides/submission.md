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

## Submission State

```tsx
import { useForm, useIsSubmitting, useSubmitCount } from 'react-f0rm';

function SubmitButton() {
  const form = useFormContext();
  const isSubmitting = useIsSubmitting(form);
  const submitCount = useSubmitCount(form);

  return (
    <button type="submit" disabled={isSubmitting}>
      {isSubmitting ? 'Saving...' : `Save (attempt #${submitCount + 1})`}
    </button>
  );
}
```
