import {create as createEmitter, emit, on} from '@for-fun/event-emitter';

/**
 * @typedef {{ emitter: import('@for-fun/event-emitter').EventEmitter; count: number }} TaskCounter
 */

/**
 * @return {TaskCounter}
 */
export default function create() {
  return {emitter: createEmitter(), count: 0};
}

/**
 * @param {TaskCounter} counter
 * @param {Promise<any>} task
 */
export function run(counter, task) {
  counter.count++;
  task.finally(() => {
    counter.count--;
    // @ts-ignore — emit types from @for-fun/event-emitter are complex
    emit(counter.emitter, 'done');
  });
}

/**
 * @param {TaskCounter} counter
 * @return {boolean}
 */
export function isRunning(counter) {
  return Boolean(counter.count);
}

/**
 * @param {TaskCounter} counter
 * @param {() => boolean} ifReject
 * @return {Promise<void>}
 */
export function waitUntil(counter, ifReject) {
  return new Promise((resolve, reject) => {
    const off = on(counter.emitter, 'done', () => {
      if (ifReject()) {
        off();
        reject();
        return;
      }
      if (counter.count) return;
      off();
      resolve();
    });
  });
}
