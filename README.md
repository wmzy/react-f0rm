# react-f0rm

## Features

- Drive by event.
- Refined tree-shaking support. Needn't have to pay for features not used.
- Theoretically more efficient(need a benchmark).

## Install

```sh
npm i react-f0rm
```
or
```
yarn add react-f0rm
```

## Usage

```jsx
import React from 'react';
import {Form, Field} from 'react-f0rm';

export default function Register() {
  return (
    <Form
      initialValues={{name: 'wmzy', email: '1256573276@qq.com'}}
      onValidSubmit={values => console.log(values)}
    >
      <Field name="name" />
      <Field name="email" />
      <button>SUBMIT</button>
    </Form>
  );
}
```

## Hooks

### `useField`

For full control over field rendering:

```jsx
import {useField} from 'react-f0rm';

function CustomField({name}) {
  const {value, onChange, onBlur, error} = useField({name});
  return (
    <div>
      <input value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
      {error && <span>{error}</span>}
    </div>
  );
}
```

### `useFieldArray`

Manage dynamic lists of fields:

```jsx
import {useFieldArray} from 'react-f0rm';

function Tags() {
  const {fields, append, remove} = useFieldArray({name: 'tags'});
  return (
    <div>
      {fields.map((field, index) => (
        <div key={field.id}>
          <Field name={['tags', index]} />
          <button type="button" onClick={() => remove(index)}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => append('')}>Add Tag</button>
    </div>
  );
}
```

## Submit Handlers

```jsx
<Form
  initialValues={{email: ''}}
  onValidSubmit={(values, e) => {
    // Called after successful validation
    saveToServer(values);
  }}
  onInvalidSubmit={(errors, values) => {
    // Called when validation fails
    console.error(errors);
  }}
>
  <Field name="email" />
  <button>Submit</button>
</Form>
```

## Validation

### Field-level validation

Pass a `validate` function to `Field` or `useField`. Return an error string or `undefined`:

```jsx
<Field
  name="email"
  validate={value => {
    if (!value.includes('@')) return 'Invalid email';
  }}
/>
```

### Form-level validation

Pass a `validate` function to `createForm`. It receives all values and returns an object of errors:

```jsx
import {createForm} from 'react-f0rm';

const form = createForm({
  initialValues: {password: '', confirm: ''},
  validate: values => {
    const errors = {};
    if (values.password !== values.confirm) {
      errors.confirm = 'Passwords do not match';
    }
    return errors;
  },
});
```

## Custom Components

Use the `as` prop to render a custom component instead of `<input>`:

```jsx
function TextArea({value, onChange, ...props}) {
  return <textarea {...props} value={value} onChange={e => onChange(e.target.value)} />;
}

<Field name="bio" as={TextArea} />
```

## TypeScript

```tsx
import {Form, Field, useForm, createForm} from 'react-f0rm';

interface UserForm {
  name: string;
  email: string;
}

const form = createForm<UserForm>();

function MyForm() {
  return (
    <Form<UserForm>
      form={form}
      onValidSubmit={values => {
        // values is typed as UserForm
        console.log(values.name);
      }}
    >
      <Field name="name" />
      <Field name="email" />
      <button>Submit</button>
    </Form>
  );
}
```
