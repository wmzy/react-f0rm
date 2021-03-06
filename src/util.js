import {on} from '@for-fun/event-emitter';

/** @typedef {import('@for-fun/event-emitter').EventEmitter} EventEmitter */

export function normalizePath(path) {
  if (Array.isArray(path)) return path;
  return path
    .split(/\.|\[/)
    .map(prop => (prop.endsWith(']') ? Number.parseInt(prop, 10) : prop));
}

export function get(values, path) {
  try {
    return path.reduce((values, p) => values[p], values);
  } catch (e) {
    return undefined;
  }
}

export function set(values, path, value) {
  if (!path.length) return values;

  const prop = path[0];
  if (typeof value === 'number') {
    const arr = Array.isArray(values) ? values.slice() : [];
    arr[prop] = set(arr[prop], path.slice(1), value);
    return arr;
  }
  return {...values, [path[0]]: set(values[prop], path.slice(1), value)};
}

export function isNil(value) {
  return value == null;
}

export function isEmpty(value) {
  if (isNil(value)) return true;
  if (typeof value !== 'object') return false;

  const values = Object.values(value);
  return values.length === 0 || values.every(isEmpty);
}

/**
 * @param {EventEmitter} emitter
 * @param {string} event
 * @param {() => boolean} isResolve
 * @param {() => boolean} isReject
 */
export function waitUntil(emitter, event, isResolve, isReject) {
  return new Promise((resolve, reject) => {
    if (isReject()) return reject();
    if (isResolve()) return resolve();

    const off = on(emitter, event, () => {
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
