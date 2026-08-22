import * as React from 'react';
import type {StoryObj, Meta} from '@storybook/react-vite';

import {Form, Field} from '../src';
import {Devtools} from '../src/devtools';
import type {DevtoolsPosition} from '../src/devtools';

const meta = {
  title: 'ReactF0rm/Devtools',
  component: Devtools,
  argTypes: {
    position: {
      control: 'radio',
      options: ['top-right', 'bottom-right', 'top-left', 'bottom-left']
    }
  }
} as Meta<typeof Devtools>;

export default meta;

type Story = StoryObj<typeof Devtools>;

export const Docked: Story = {
  args: {position: 'top-right'},
  render: ({position}: {position?: DevtoolsPosition}) => (
    <Form initialValues={{email: '', password: ''}}>
      <label>
        email{' '}
        <Field
          type="email"
          name="email"
          validate={v => (v ? undefined : 'required')}
        />
      </label>
      <label>
        password{' '}
        <Field
          type="password"
          name="password"
          validate={v => (v.length < 8 ? 'too short' : undefined)}
        />
      </label>
      <Devtools position={position} />
    </Form>
  )
};

export const NestedValues: Story = {
  render: () => (
    <Form
      initialValues={{
        user: {name: 'ada', contacts: [{kind: 'email', value: 'ada@lovelace.dev'}]},
        tags: ['math', 'engine'],
        active: true,
        meta: null
      }}
    >
      <label>
        name <Field name="user.name" />
      </label>
      <Devtools />
    </Form>
  )
};
