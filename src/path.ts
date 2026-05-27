import {normalizePath} from './util';

type PathValue = (string | number)[];
type Name = string | PathValue;
type Path = {value: PathValue; key: string};

export default function create(name: Name): Path {
  const value = normalizePath(name);
  return {value, key: JSON.stringify(value)};
}
