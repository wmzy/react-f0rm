import {on} from '@for-fun/event-emitter';
import type {EventEmitter} from '@for-fun/event-emitter';

const pathCache = new Map<string, (string | number)[]>();

export function normalizePath(
  path: string | (string | number)[]
): (string | number)[] {
  if (Array.isArray(path)) return path;
  const cached = pathCache.get(path);
  if (cached) return cached;
  const value = parsePath(path);
  pathCache.set(path, value);
  return value;
}

function parsePath(path: string): (string | number)[] {
  const result: (string | number)[] = [];
  let identifier = '';
  const flushIdentifier = () => {
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
        result.push(/^-?\d+$/.test(content) ? Number(content) : content);
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

/**
 * Immutable counterpart of {@link set}: removes the path from the value
 * tree, copying only along the touched branch (untouched branches stay
 * shared with the source, like set). Deletes the key entirely rather than
 * writing undefined, so the result carries no `a: undefined` entries.
 */
export function unset(values: any, path: (string | number)[]): any {
  if (!path.length || values == null) return values;
  const [prop, ...props] = path;
  if (props.length) {
    const next = unset(values[prop], props);
    return next === values[prop] ? values : set(values, path, next);
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

export function set(values: any, path: (string | number)[], value: any): any {
  if (!path.length) return value;

  const [prop, ...props] = path;
  if (typeof prop === 'number') {
    const arr = Array.isArray(values) ? values.slice() : [];
    arr[prop] = set(arr[prop], props, value);
    return arr;
  }
  return {...values, [prop]: set(values && values[prop], props, value)};
}

/**
 * Ownership-tracked {@link set}: merge many paths into one tree without
 * re-copying containers the merge itself already created.
 *
 * Containers present in `owned` (freshly created by an earlier call of the
 * same merge) are mutated in place; every other container -- nodes borrowed
 * from the seed tree and user leaf values -- is copied first with the exact
 * copy rules `set` applies (numeric prop: array slice, or a fresh array
 * when the node is not one; string prop: object spread). Chaining
 * `setOwned` over a list of paths therefore produces the tree chaining
 * `set` would, in the same insertion order, but allocates each distinct
 * container once (O(distinct path prefixes)) instead of re-copying the
 * whole branch for every path (O(paths x depth)).
 *
 * Use a fresh `owned` set per merge and thread the returned root (a copied
 * replacement when the seed root itself had to be copied) into the next
 * call. Borrowed containers are never mutated.
 */
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
    if (!owned.has(container)) {
      let copy: any;
      if (typeof prop === 'number') {
        copy = Array.isArray(container) ? container.slice() : [];
      } else {
        copy = {...container};
      }
      owned.add(copy);
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

export function isNil(value: any): value is null | undefined {
  return value == null;
}

export function isEmpty(value: any): boolean {
  if (isNil(value)) return true;
  if (typeof value !== 'object') return false;

  const values = Object.values(value);
  return values.length === 0 || values.every(isEmpty);
}

export function isPromise(value: any): value is Promise<any> {
  return value && typeof value.then === 'function';
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
      if (isResolve()) return;
      off();
      resolve();
    });
  });
}
