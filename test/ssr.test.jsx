/**
 * SSR behavior of the headless hooks: renderToString must render
 * form-driven components with their initial values, and the resulting
 * markup must hydrate on the client without mismatches (getServerSnapshot
 * of useWatchCore shares the client snapshot logic).
 *
 * Origin: Wave 1 "SsrSupport" task.
 */
import {describe, it, expect, vi, afterEach} from 'vitest';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {hydrateRoot} from 'react-dom/client';
import {act, fireEvent} from '@testing-library/react';
import useForm from '../src/hooks/form';
import useField from '../src/hooks/field';

function ProfileForm() {
  const form = useForm({initialValues: {name: 'ada', city: 'london'}});
  const name = useField({form, name: 'name'});
  const city = useField({form, name: 'city'});
  return (
    <form>
      <input
        data-testid="name"
        value={name.value ?? ''}
        onChange={e => name.onChange(e.target.value)}
      />
      <input
        data-testid="city"
        value={city.value ?? ''}
        onChange={e => city.onChange(e.target.value)}
      />
    </form>
  );
}

const HYDRATION_ISSUE = /hydrat|did not match|mismatch/i;
const roots = [];
const containers = [];

afterEach(() => {
  while (roots.length) roots.pop().unmount();
  while (containers.length) containers.pop().remove();
});

describe('SSR', () => {
  it('renderToString renders initial values without throwing or warning', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const html = renderToString(<ProfileForm />);

    expect(html).toContain('value="ada"');
    expect(html).toContain('value="london"');
    // React 18 throws inside server render when useSyncExternalStore lacks
    // getServerSnapshot; a missing third arg would fail the render above.
    expect(
      errorSpy.mock.calls
        .map(args => args.join(' '))
        .filter(m => HYDRATION_ISSUE.test(m))
    ).toEqual([]);

    errorSpy.mockRestore();
  });

  it('hydrateRoot reuses server markup and stays interactive', async () => {
    const html = renderToString(<ProfileForm />);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    containers.push(container);

    await act(async () => {
      roots.push(hydrateRoot(container, <ProfileForm />));
    });

    // No hydration mismatch: client's first snapshot equals the server's.
    expect(
      errorSpy.mock.calls
        .map(args => args.join(' '))
        .filter(m => HYDRATION_ISSUE.test(m))
    ).toEqual([]);

    // Hydrated tree is a live controlled form: typing updates the input.
    const input = container.querySelector('[data-testid="name"]');
    expect(input.value).toBe('ada');
    await act(async () => {
      fireEvent.change(input, {target: {value: 'grace'}});
    });
    expect(input.value).toBe('grace');

    errorSpy.mockRestore();
  });
});
