export function get(values, paths) {
  try {
    return paths.reduce((p, values) => values[p], values);
  } catch (e) {
    return undefined;
  }
}

export function set(values, paths, value) {
  if (!paths.length) return values;

  const path = paths[0];
  if (Number.isNumber(value)) {
    const arr = Array.isArray(values) ? values.slice() : [];
    arr[path] = set(arr[path], paths.slice(1), value);
    return arr;
  }
  return {...values, [paths[0]]: set(values[path], paths.slice(1), value)};
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
