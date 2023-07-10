import * as React from 'react';
import type {StoryObj, Meta} from '@storybook/react';

import {Form, Field, Checkbox} from '../src';

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
          <Field name="name" />
        </label>
      </div>
      <div>
        <label>
          gender:
          <Field as="select" name="gender">
            <option value="female">female</option>
            <option value="male">male</option>
            <option value="other">other</option>
          </Field>
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
          <Field name="name" required minLength={2} maxLength={20} pattern="[A-Za-z]+" />
        </label>
      </div>
      <div>
        <label>
          age:
          <Field
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

const Input = ({ label, ...props }) => (
  <div>
    <label>{label}</label>
    <Field {...props} />
  </div>
);

const Select = React.forwardRef(({ label, ...props }, ref) => (
  <div>
    <label>{label}</label>
    <select {...props} ref={ref}>
      <option value="20">20</option>
      <option value="30">30</option>
    </select>
  </div>
));

export const IntegratingAnExistingForm: StoryObj<typeof Form> = {
  render: () => (
    <Form
      onSubmit={(values, e) => {
        console.log('values:', values);
      }}
      onValidSubmit={(values, e) => {
        console.log('valid values:', values);
      }}
    >
      <Input label="Name" name="name" required />
      <Field as={Select} label="Age" name="age" />
      <button>SUBMIT</button>
    </Form>
  )
};
