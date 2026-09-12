---
sidebar_position: 9
---

# ErrorSummary Component

A GOV.UK-style error summary: one `role='alert'` box listing every current field error, each rendered as an anchor into the form. Renders `null` while the form has no errors.

```tsx
import {createForm, Form, Field, ErrorSummary} from 'react-f0rm';

const form = createForm({initialValues: {name: ''}});

<Form form={form} shouldFocusError={false}>
  <ErrorSummary form={form} />
  <Field name="name" validate={v => (v ? undefined : 'Tell us your name')} />
</Form>
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `form` | `Form<TValues>` | Explicit form instance — skips the form context, works without a `<Form>` provider |
| `context` | `React.Context<Form<any> \| null>` | Isolated context from `createFormContext()`; defaults to `FormContext` |
| `heading` | `string` | Heading text above the list; defaults to `'There is a problem'` |

With neither `form` nor a provider above it, the component throws `'no form provided'` (same contract as `useField` and friends). It takes no other props and renders no children.

## What it lists

The data source is [`useErrors`](../guides/hooks-reference.md#useerrors--useformstateerrors--typed-memoized): a flat record keyed by dotted path (`'a.b'`, `'items.0.name'`), values the stored `FieldError[]` arrays. One `<li>` per field; when a field holds several errors only the first message becomes the link text.

- **Field errors** render as `<li><a href={'#' + fieldErrorId(name)}>{message}</a></li>`. The href matches the id a field's `aria-describedby` already points at — the same id `<Field>`'s built-in `renderError` span (or a custom error component rendering `fieldErrorId(name)`) carries, so the link lands next to the message.
- [`FORM_ERROR`](../guides/validation.md#the-form-level-error-slot-form_error) (`'_form'`) entries render as `<li><p>{message}</p></li>` — there is no field element to focus or link to.

## Clicking a link focuses the field

Each anchor's click handler calls `preventDefault()` and `setFocus(form, path)` — the same `focusError` channel a failed `handleSubmit` uses. The target field focuses whether it was rendered by `<Field>`, bound with `form.register`, or holds a `focusRef`; an unmounted path is a silent no-op.

## Auto-focus after a failed submit

When the submit state machine transitions `isSubmitting` `true → false` with errors still present, the summary box (a `tabIndex={-1}` container) focuses itself — the GOV.UK "move focus to the error summary" behavior. A failed submit otherwise focuses the first errored field (`shouldFocusError`, default `true`), and that focus lands *after* the summary's — so apps using the summary's auto-focus should pass `shouldFocusError={false}` to `<Form>` / `handleSubmit`.

The heading's `id` comes from `React.useId()` and is wired to the container's `aria-labelledby`, so screen readers announce the heading when the box takes focus.
