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
import * as react from 'react';
import {From, Field} from 'react-f0rm';

export default function Register() {
  return (
    <Form
      initialValues={{name: 'wmzy', email: '1256573276@qq.com'}}
      onSubmit={values => console.log(values)}
    >
      <Field
        name={['name']}
        render={({onChange, ...props}) => (
          <input {...props} onChange={e => onChange(e.target.value)} />
        )}
      />
      <button>SUBMIT</button>
    </Form>
  );
}
```
