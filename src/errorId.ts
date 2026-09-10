import createPath from './path';
import type {Name} from './path';

/**
 * Converts a path key (the JSON.stringify'd path segments, e.g.
 * '["a","0"]') into a valid HTML id ('a-0'): quotes, brackets, commas and
 * whitespace become hyphens; leading/trailing hyphens are trimmed. Falls
 * back to 'field' if nothing remains.
 */
export function errorIdFromKey(key: string): string {
  const id = key.replace(/["'[\],\s]+/g, '-').replace(/^-+|-+$/g, '');
  return id || 'field';
}

/**
 * The error-message element id a field's `aria-describedby` points at —
 * `fieldErrorId('a[0].b')` is `'a-0-b'`, the same id `<Field>`'s built-in
 * `renderError` span carries. This is the library-level wiring convention:
 * whenever a bound field (Field/Checkbox/Select, `useField`'s `inputProps`)
 * has an error it sets `aria-invalid` and describes the element with this
 * id, so a custom error component only needs
 * `<span id={fieldErrorId(name)} role="alert">` to complete the
 * accessible-name chain for screen readers.
 * @param name the same field name passed to the bound component
 */
export function fieldErrorId(name: Name): string {
  return errorIdFromKey(createPath(name).key);
}
