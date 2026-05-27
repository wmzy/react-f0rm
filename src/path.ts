import {normalizePath} from './util';

export type PathValue = (string | number)[];
export type Name = string | PathValue;
export type Path = {value: PathValue; key: string};

export default function create(name: Name): Path {
  const value = normalizePath(name);
  return {value, key: JSON.stringify(value)};
}
