import {create as createEmitter, emit, on} from '@for-fun/event-emitter';
/** @typedef { import('../index').TaskCounter } TaskCounter */

/**
 * @return {TaskCounter}
 */
export default function create() {
  return {emitter: createEmitter(), count: 0};
}

/**
 * @param {TaskCounter} counter
 * @param {Promise} task
 */
export function run(counter, task) {
  counter.count++;
  task.finally(() => {
    counter.count--;
    emit(counter.emitter, 'done');
  });
}

/**
 * @param {TaskCounter} counter
 */
export function isRunning(counter) {
  return Boolean(counter.count);
}

/**
 * @param {TaskCounter} counter
 * @param {() => boolean} ifReject
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
