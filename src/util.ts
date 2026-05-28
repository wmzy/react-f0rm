import {on} from '@for-fun/event-emitter';
import type {EventEmitter} from '@for-fun/event-emitter';

export function normalizePath(
  path: string | (string | number)[]
): (string | number)[] {
  if (Array.isArray(path)) return path;
  return path
    .split(/\.|\[/)
    .map(prop => (prop.endsWith(']') ? Number.parseInt(prop, 10) : prop));
}

export function get(values: any, path: (string | number)[]): any {
  return path.reduce((current: any, p: string | number) => {
    if (current == null) return undefined;
    return current[p];
  }, values);
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
