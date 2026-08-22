# Server-side Rendering

react-f0rm renders on the server out of the box: `renderToString` renders form-driven components with their initial values, and the client's `hydrateRoot` matches the server markup — no provider shims, no `typeof window` guards.

Form state lives in synchronously readable Map/Set structures seeded from `initialValues`, and every subscription goes through `useSyncExternalStore` whose `getServerSnapshot` computes the same snapshot as the client's first render, so hydration is consistent by construction.

## renderToString + hydrateRoot

```tsx
import {useForm, useField} from 'react-f0rm';
import {renderToString} from 'react-dom/server';
import {hydrateRoot} from 'react-dom/client';

function ProfileForm() {
  const form = useForm({initialValues: {name: 'ada', city: 'london'}});
  const name = useField({form, name: 'name'});
  const city = useField({form, name: 'city'});
  return (
    <form>
      <input value={name.value ?? ''} onChange={(e) => name.onChange(e.target.value)} />
      <input value={city.value ?? ''} onChange={(e) => city.onChange(e.target.value)} />
    </form>
  );
}

// Server: renders <input value="ada"> and <input value="london">
const html = renderToString(<ProfileForm />);

// Client: hydrates without mismatches and stays interactive
const container = document.getElementById('root')!;
container.innerHTML = html;
hydrateRoot(container, <ProfileForm />);
```

This exact flow (initial values rendered server-side, hydration without mismatches, interactivity afterwards) is verified by [`test/ssr.test.jsx`](https://github.com/wmzy/react-f0rm/blob/main/test/ssr.test.jsx).

## Notes

- Controlled `values` on `useForm` are seeded synchronously during the first render, so SSR reflects them too.
- The structural-equivalence sync guard (see [useForm](../api/use-form.md)) also applies after hydration: a re-render passing an inline literal with equal content never re-syncs, so user edits survive.
