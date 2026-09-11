import {on} from './emitter';
import type {EventEmitter} from './emitter';

/** FIFO bound for {@link pathCache} — a backstop for dynamic keys
 * ('items[' + id + ']'); eviction drops the oldest and only costs a
 * re-parse, never behavior. */
const PATH_CACHE_LIMIT = 1e4;

const pathCache = new Map<string, (string | number)[]>();

/** Test-only view of the path cache size (not re-exported from the entry). */
export const pathCacheSize: () => number = () => pathCache.size;

export function normalizePath(
  path: string | (string | number)[]
): (string | number)[] {
  if (Array.isArray(path)) return path;
  const cached = pathCache.get(path);
  if (cached) return cached;
  const value = parsePath(path);
  if (pathCache.size >= PATH_CACHE_LIMIT) {
    // Insertion order is FIFO order (non-empty since size >= 1e4).
    const oldest = pathCache.keys().next();
    if (!oldest.done) pathCache.delete(oldest.value);
  }
  pathCache.set(path, value);
  return value;
}

/** Integer array index (optionally negative)? Parsed paths never carry
 * index strings (dotted numerics throw); it defends programmatic
 * segments from raw arrays and internal callers. */
export const isIndex: (segment: string) => boolean = segment =>
  /^-?\d+$/.test(segment);

function parsePath(path: string): (string | number)[] {
  const result: (string | number)[] = [];
  let identifier = '';
  const flushIdentifier = () => {
    if (isIndex(identifier)) {
      // Rebuild both spellings for an actionable error message.
      const dotted = [...result.map(String), identifier].join('.');
      const bracket = result.reduce(
        (acc: string, seg: string | number) =>
          acc +
          (typeof seg === 'number' ? `[${seg}]` : `${acc ? '.' : ''}${seg}`),
        ''
      );
      throw new TypeError(
        `Numeric path segment must use bracket notation: "${dotted}" → "${bracket}[${identifier}]" (path: ${path})`
      );
    }
    result.push(identifier);
    identifier = '';
  };

  for (let i = 0; i < path.length; i++) {
    const char = path[i];
    if (char === '.') {
      if (identifier !== '') flushIdentifier();
    } else if (char === '[') {
      if (identifier !== '') flushIdentifier();
      const quote = path[i + 1];
      if (quote === '"' || quote === "'") {
        const close = path.indexOf(quote, i + 2);
        if (close === -1) {
          throw new TypeError(`Unterminated quote in path: ${path}`);
        }
        if (path[close + 1] !== ']') {
          throw new TypeError(
            `Expected "]" after quoted segment in path: ${path}`
          );
        }
        result.push(path.slice(i + 2, close));
        i = close + 1;
      } else {
        const close = path.indexOf(']', i + 1);
        if (close === -1) {
          throw new TypeError(`Unterminated bracket in path: ${path}`);
        }
        const content = path.slice(i + 1, close);
        result.push(isIndex(content) ? Number(content) : content);
        i = close;
      }
    } else {
      identifier += char;
    }
  }
  if (identifier !== '' || result.length === 0) flushIdentifier();
  return result;
}

export function get(values: any, path: (string | number)[]): any {
  return path.reduce((current: any, p: string | number) => {
    if (current == null) return undefined;
    return current[p];
  }, values);
}

/** Immutable counterpart of {@link set}: removes the path, copying only
 * the touched branch; deletes the key rather than writing undefined. */
export function unset(values: any, path: (string | number)[]): any {
  if (!path.length || values == null) return values;
  const [prop, ...props] = path;
  if (props.length) {
    const next = unset(values[prop], props);
    // Reattach at the parent key, not the full path (which would re-write
    // the removed subtree).
    return next === values[prop] ? values : set(values, [prop], next);
  }
  if (Array.isArray(values)) {
    if (!(prop in values)) return values;
    const arr = values.slice();
    delete arr[prop as number];
    return arr;
  }
  if (typeof values !== 'object' || !(prop in values)) return values;
  const copy = {...values};
  delete copy[prop as string];
  return copy;
}

/** The array index `prop` writes inside `container`, or `undefined` for
 * an object key. A numeric segment always addresses an array slot
 * (starting one when `container` isn't an array yet); a numeric string
 * does only when `container` is already an array. */
function arraySlot(container: any, prop: string | number): number | undefined {
  if (typeof prop === 'number') return prop;
  if (Array.isArray(container) && typeof prop === 'string' && isIndex(prop)) {
    return Number(prop);
  }
  return undefined;
}

/** Copy-on-write for one descent step: array slots copy as an array (or
 * start one), object keys spread into a new object. */
function copyForProp(container: any, prop: string | number): any {
  if (arraySlot(container, prop) !== undefined) {
    return Array.isArray(container) ? container.slice() : [];
  }
  return {...container};
}

/** Copy-on-write container for {@link setOwned}: returns `container` as-is
 * when this merge already owns it, otherwise copies it (registering the
 * copy) so later paths under it share the same allocation. */
function ensureOwned(
  container: any,
  prop: string | number,
  owned: Set<object>
): any {
  if (owned.has(container)) return container;
  const copy = copyForProp(container, prop);
  owned.add(copy);
  return copy;
}

export function set(values: any, path: (string | number)[], value: any): any {
  if (!path.length) return value;

  const [prop, ...props] = path;
  // Numeric segments use the array copy rule; an object spread would
  // corrupt the array.
  const index = arraySlot(values, prop);
  if (index !== undefined) {
    const arr = copyForProp(values, prop);
    arr[index] = set(arr[index], props, value);
    return arr;
  }
  return {...values, [prop]: set(values && values[prop], props, value)};
}

/** Ownership-tracked {@link set}: merge many paths without re-copying
 * containers this merge already created. Containers in `owned` mutate in
 * place; borrowed containers are copied once (per `set`'s copy rules), so
 * a list of paths allocates each distinct prefix once. Use a fresh `owned`
 * per merge and thread the returned root onward. */
export function setOwned(
  root: any,
  path: (string | number)[],
  value: any,
  owned: Set<object>
): any {
  if (!path.length) return value;
  let container = root;
  let parent: any = null;
  let parentProp: string | number = '';
  for (let i = 0; i < path.length; i++) {
    const prop = path[i];
    const copy = ensureOwned(container, prop, owned);
    if (copy !== container) {
      if (i === 0) root = copy;
      else parent[parentProp] = copy;
      container = copy;
    }
    if (i === path.length - 1) {
      container[prop] = value;
    } else {
      parent = container;
      parentProp = prop;
      container = container[prop];
    }
  }
  return root;
}

export function isEmpty(value: any): boolean {
  if (value == null) return true;
  if (typeof value !== 'object') return false;

  const values = Object.values(value);
  return values.length === 0 || values.every(isEmpty);
}

export function isPromise(value: any): value is Promise<any> {
  return value && typeof value.then === 'function';
}

/** Shared DOM event → value protocol: file → FileList, checkbox →
 * `checked`, `valueAsNumber`/`valueAsDate` → typed accessors, else the
 * string `value`; a non-DOM argument passes through unchanged. */
export function extractEventValue(
  e: any,
  options?: {
    valueAsNumber?: boolean;
    valueAsDate?: boolean;
  }
): any {
  const target = e?.target;
  if (!target) return e;
  if (target.type === 'file') return target.files;
  if (target.type === 'checkbox') return target.checked;
  if (options?.valueAsNumber) return target.valueAsNumber;
  if (options?.valueAsDate) return target.valueAsDate;
  return target.value;
}

/** Default event-to-value binding: explicit `eventToValue` wins, else
 * extraction follows valueAsNumber/valueAsDate. */
export function eventToValueOrDefault(
  eventToValue: ((e: any) => any) | undefined,
  options?: {valueAsNumber?: boolean; valueAsDate?: boolean}
): (e: any) => any {
  return eventToValue ?? ((e: any) => extractEventValue(e, options));
}

/** Structural equality for default data (primitives, arrays, plain
 * objects, Dates); class instances compare unequal, errs toward re-seeding. */
export function isEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const isArray = Array.isArray(a);
  if (isArray !== Array.isArray(b)) return false;
  if (isArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const proto = Object.getPrototypeOf(a);
  if (proto !== Object.prototype && proto !== null) return false;
  if (Object.getPrototypeOf(b) !== proto) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!isEqual(a[key], b[key])) return false;
  }
  return true;
}

export function waitUntil(
  emitter: EventEmitter<any>,
  event: string,
  isResolve: () => boolean,
  isReject: () => boolean
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (isReject()) return void reject();
    if (isResolve()) return void resolve();

    const off = on(emitter, event as any, () => {
      if (isReject()) {
        off();
        reject();
        return;
      }
      // Not resolved yet — stay subscribed and keep waiting.
      if (!isResolve()) return;
      off();
      resolve();
    });
  });
}

/** DEV-only snapshot guard for {@link getValues}: deep-clones and freezes
 * plain objects/arrays so mutation throws instead of corrupting the shared
 * memoized result. Non-plain values pass through unfrozen (cloning would
 * strip prototypes, freezing breaks methods like Date#setHours). */
export function freezeValues(value: any): any {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeValues));
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const clone: Record<string, any> = {};
  for (const key of Object.keys(value)) clone[key] = freezeValues(value[key]);
  return Object.freeze(clone);
}
