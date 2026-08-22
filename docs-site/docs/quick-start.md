---
sidebar_position: 2
---

# Quick Start

## Installation

```bash
npm install react-f0rm
```

## Basic Usage

```tsx
import { Form, Field } from 'react-f0rm';

function Signup() {
  return (
    <Form
      initialValues={{ email: '', password: '' }}
      onSubmit={(values) => console.log(values)}
    >
      <Field name='email' type='email' placeholder='Email' />
      <Field name='password' type='password' placeholder='Password' />
      <button type='submit'>Sign Up</button>
    </Form>
  );
}
```

## With Validation

```tsx
import { Form, Field } from 'react-f0rm';

function Signup() {
  return (
    <Form
      initialValues={{ email: '' }}
      validate={(values) => {
        const errors: Record<string, string> = {};
        if (!values.email) errors.email = 'Required';
        return errors;
      }}
      onValidSubmit={(values) => console.log('Valid:', values)}
      onInvalidSubmit={(errors) => console.log('Errors:', errors)}
    >
      <Field name='email' required renderError={(error) => <em>{error}</em>} />
      <button type='submit'>Submit</button>
    </Form>
  );
}
```

`renderError` renders the error message in a `role='alert'` span and links it to the input via `aria-describedby` automatically — omit it to stay headless.

## With Schema Validation

```tsx
import { Form, Field } from 'react-f0rm';
import { zodResolver } from 'react-f0rm/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Min 8 characters'),
});

function Signup() {
  return (
    <Form
      initialValues={{ email: '', password: '' }}
      onSubmit={(values) => console.log(values)}
    >
      <Field name='email' validate={zodResolver(schema.shape.email)} />
      <Field name='password' type='password' validate={zodResolver(schema.shape.password)} />
      <button type='submit'>Sign Up</button>
    </Form>
  );
}
```

Any library implementing the [Standard Schema](https://standardschema.dev) spec (zod v3.24+/v4, valibot v1, arktype, …) also works through one adapter — see [Schema Resolvers](./api/resolvers.md).
