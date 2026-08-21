import {useMemo} from 'react';
import create from '../path';
import type {Name, Path} from '../path';
import {normalizePath} from '../util';

export default function usePath(name: Name): Path {
  const path = useMemo(() => create(normalizePath(name)), [name]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are `path.key` on purpose: re-renders passing a fresh array for the same field name reuse the cached Path object (stable reference & Map key)
  return useMemo(() => path, [path.key]);
}
