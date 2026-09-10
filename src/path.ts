import {normalizePath} from './util';

export type PathSegments = (string | number)[];
export type Name = string | PathSegments;
export type Path = {value: PathSegments; key: string};

export default function create(name: Name): Path {
  const value = normalizePath(name);
  return {value, key: JSON.stringify(value)};
}

/** Parse a path key — the JSON form every path-keyed store uses, always
 * produced by {@link create} — back into its segments. */
export function segmentsFromKey(key: string): PathSegments {
  return JSON.parse(key) as PathSegments;
}
