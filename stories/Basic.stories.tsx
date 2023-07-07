import * as React from 'react';
import type {StoryObj, Meta} from '@storybook/react';

import {Form, Field, Input, Checkbox} from '../src';
import {FormProps} from '..';

const meta = {
  title: 'ReactF0rm/Basic',
  component: Form,
  argTypes: {
    backgroundColor: {control: 'color'}
  }
} as Meta;

export default meta;

export const Register: StoryObj<typeof Form> = {
  render: () => (
    <Form
      onSubmit={(values, e) => {
        console.log(values);
      }}
    >
      <div>
        <label>
          name:
          <Input name="name" />
        </label>
      </div>
      <div>
        <label>
          gender:
          <Input as="select" name="gender">
            <option value="female">female</option>
            <option value="male">male</option>
            <option value="other">other</option>
          </Input>
        </label>
      </div>
      <button type="submit">SUBMIT</button>
    </Form>
  )
};

export const Validation: StoryObj<typeof Form> = {
  render: () => (
    <Form
      onSubmit={(values, e) => {
        console.log('values:', values);
      }}
      onValidSubmit={(values, e) => {
        console.log('valid values:', values);
      }}
    >
      <div>
        <label>
          name:
          <Input name="name" required minLength={2} maxLength={20} pattern="[A-Za-z]+" />
        </label>
      </div>
      <div>
        <label>
          age:
          <Input
            name="age"
            validate={age =>
              {
                console.log('vvv')
                return Number(age) <= 0 ? 'age should be a positive number' : undefined;
              }
            }
            max={100}
            type="number"
          />
        </label>
      </div>
      <button>SUBMIT</button>
    </Form>
  )
};
