import {useMemo} from 'react';
import create from '../path';
import type {Name, Path} from '../path';
import {normalizePath} from '../util';

export default function usePath(name: Name): Path {
  const path = useMemo(() => create(normalizePath(name)), [name]);
  return useMemo(() => path, [path.key]);
}
