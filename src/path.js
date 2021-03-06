import {normalizePath} from './util';

/** @typedef { import('../index').Path} Path */
/** @typedef { import('../index').PathValue} PathValue */

/**
 * @param {string | PathValue} name
 * @returns {Path}
 */
export default function create(name) {
  const value = normalizePath(name);
  return {value, key: JSON.stringify(value)};
}
