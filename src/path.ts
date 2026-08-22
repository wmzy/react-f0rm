import {normalizePath} from './util';

export type PathSegments = (string | number)[];
export type Name = string | PathSegments;
export type Path = {value: PathSegments; key: string};

export default function create(name: Name): Path {
  const value = normalizePath(name);
  return {value, key: JSON.stringify(value)};
}
