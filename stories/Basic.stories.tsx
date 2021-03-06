import * as React from 'react';
// also exported from '@storybook/react' if you can deal with breaking changes in 6.1
import {Story, Meta} from '@storybook/react/types-6-0';

import {Form, Field} from '../src';
import {FormProps} from '..';

export default {
  title: 'ReactF0rm/Basic',
  component: Form,
  argTypes: {
    backgroundColor: {control: 'color'}
  }
} as Meta;

const Template: Story<FormProps> = args => <Form {...args} />;

export function Register() {
  return (
    <Form
      defaultValues={{name: 'wmzy', email: '1256573276@qq.com'}}
      onSubmit={values => console.log(values)}
    >
      <div>
        <Field
          name="name"
          render={({onChange, ...props}) => (
            <input {...props} onChange={e => onChange(e.target.value)} />
          )}
        />
      </div>
      <div>
        <Field
          name="age"
          validate={age =>
            Number(age) <= 0 ? 'age should be a positive number' : undefined
          }
          render={({onChange, error, ...props}) => (
            <>
              <input {...props} onChange={e => onChange(e.target.value)} />
              {error}
            </>
          )}
        />
      </div>
      <button>SUBMIT</button>
    </Form>
  );
}
