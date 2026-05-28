import {useCallback, useRef, type MutableRefObject} from 'react';

export default function useStage<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useStageFn<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useStage(fn);
  return useCallback(
    (...params: any[]) => ref.current(...params),
    []
  ) as unknown as T;
}
