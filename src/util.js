import {on} from '@for-fun/event-emitter';

/** @typedef {import('@for-fun/event-emitter').EventEmitter} EventEmitter */

export function normalizePath(path) {
  if (Array.isArray(path)) return path;
  return path
    .split(/\.|\[/)
    .map(prop => (prop.endsWith(']') ? Number.parseInt(prop, 10) : prop));
}

// eslint-disable-next-line consistent-return
export function get(values, path) {
  try {
    return path.reduce((values, p) => values[p], values);
    // eslint-disable-next-line no-empty
  } catch (e) {}
}

export function set(values, path, value) {
  if (!path.length) return value;

  const [prop, ...props] = path;
  if (typeof prop === 'number') {
    const arr = Array.isArray(values) ? values.slice() : [];
    arr[prop] = set(arr[prop], props, value);
    return arr;
  }
  return {...values, [prop]: set(values && values[prop], props, value)};
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
    if (isReject()) return void reject();
    if (isResolve()) return void resolve();

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
