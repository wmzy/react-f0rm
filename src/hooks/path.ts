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
  // Two layers: the outer memo keys on the serialized path, so re-renders
  // passing a fresh array for the same field name reuse the cached Path
  // object (stable reference & Map key); the inner memo absorbs the
  // normalize+create work for referentially stable callers. The outer
  // layer rebuilds the Path from the key string, so its closure pins the
  // subscription on the key alone — never on the per-render name array.
  const key = useMemo(() => create(normalizePath(name)).key, [name]);
  return useMemo<Path>(() => pathFromKey(key), [key]);
}
