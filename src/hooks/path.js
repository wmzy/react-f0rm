import {useMemo} from 'react';
import create from '../path';
import {normalizePath} from '../util';

export default function usePath(name) {
  const path = useMemo(() => create(normalizePath(name)), [name]);
  return useMemo(() => path, [path.key]);
}
