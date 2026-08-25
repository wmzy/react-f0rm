import {describe, it, expect} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import React from 'react';
import Form from '../../src/components/Form';
import {Select} from '../../src/components/Field';
import createForm, {getValues} from '../../src/form';

describe('Select', () => {
  it('renders with nothing selected when the field has no value', () => {
    render(
      <Form initialValues={{color: ''}}>
        <Select name="color" data-testid="color">
          <option value="">Pick a color</option>
          <option value="red">Red</option>
          <option value="blue">Blue</option>
        </Select>
      </Form>
    );
    const select = screen.getByTestId('color');
    expect(select.value).toBe('');
    expect(screen.getByText('Red').selected).toBe(false);
    expect(screen.getByText('Blue').selected).toBe(false);
  });

  it('updates the value on change (single select)', () => {
    const form = createForm({initialValues: {color: ''}});
    render(
      <Form form={form}>
        <Select name="color" data-testid="color">
          <option value="red">Red</option>
          <option value="blue">Blue</option>
        </Select>
      </Form>
    );
    const select = screen.getByTestId('color');
    fireEvent.change(select, {target: {value: 'blue'}});
    expect(select.value).toBe('blue');
    expect(getValues(form)).toEqual({color: 'blue'});
  });

  it('drives selection from value and collects an array on change (multiple)', () => {
    const form = createForm({initialValues: {colors: ['red', 'blue']}});
    render(
      <Form form={form}>
        <Select name="colors" multiple data-testid="colors">
          <option value="red">Red</option>
          <option value="blue">Blue</option>
          <option value="green">Green</option>
        </Select>
      </Form>
    );
    const select = screen.getByTestId('colors');

    // value drives which options are selected
    expect(Array.from(select.selectedOptions).map(o => o.value)).toEqual([
      'red',
      'blue'
    ]);

    // selecting more options stores the full selection as an array
    screen.getByText('Green').selected = true;
    fireEvent.change(select);
    expect(getValues(form)).toEqual({colors: ['red', 'blue', 'green']});
  });

  it('renders a multiple select with nothing selected for an empty array value', () => {
    render(
      <Form initialValues={{colors: []}}>
        <Select name="colors" multiple data-testid="colors">
          <option value="red">Red</option>
          <option value="blue">Blue</option>
        </Select>
      </Form>
    );
    const select = screen.getByTestId('colors');
    expect(select.multiple).toBe(true);
    expect(select.selectedOptions).toHaveLength(0);
  });

  it('renders nothing selected when a multiple select holds a non-array value', () => {
    // A string sneaking into a multiple select must not select anything.
    render(
      <Form initialValues={{colors: 'red'}}>
        <Select name="colors" multiple data-testid="colors">
          <option value="red">Red</option>
          <option value="blue">Blue</option>
        </Select>
      </Form>
    );
    expect(screen.getByTestId('colors').selectedOptions).toHaveLength(0);
  });

  it('falls back to an empty string for a nullish single-select value', () => {
    render(
      <Form initialValues={{color: null}}>
        <Select name="color" data-testid="color">
          <option value="">None</option>
          <option value="red">Red</option>
        </Select>
      </Form>
    );
    expect(screen.getByTestId('color').value).toBe('');
  });
});
