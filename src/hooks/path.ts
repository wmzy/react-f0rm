import {useMemo} from 'react';
import create, {segmentsFromKey} from '../path';
import type {Name, Path} from '../path';
import {normalizePath} from '../util';

/** Rebuild a {@link Path} from its serialized key — the key-pinned
 * subscription pattern: rebuild inside the subscription setup so a
 * closure never captures a render-scope `name`/`Path` object. */
export function pathFromKey(key: string): Path {
  return create(segmentsFromKey(key));
}

export default function usePath(name: Name): Path {
  // The outer memo rebuilds the Path from its key so subscriptions pin on
  // the key, never the per-render name array; the inner memo absorbs the
  // normalize+create work.
  const key = useMemo(() => create(normalizePath(name)).key, [name]);
  return useMemo<Path>(() => pathFromKey(key), [key]);
}
