import createPath from './path';
import type {Name} from './path';

/** Converts a path key (JSON-stringified segments, e.g. '["a","0"]') into
 * a valid HTML id ('a-0'); falls back to 'field'. */
export function errorIdFromKey(key: string): string {
  const id = key.replace(/["'[\],\s]+/g, '-').replace(/^-+|-+$/g, '');
  return id || 'field';
}

/** The error-message element id a field's `aria-describedby` points at
 * (same id `<Field>`'s renderError span carries). A custom error
 * component completes the accessible-name chain with
 * `<span id={fieldErrorId(name)} role="alert">`. */
export function fieldErrorId(name: Name): string {
  return errorIdFromKey(createPath(name).key);
}
