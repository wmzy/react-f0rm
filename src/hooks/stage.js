import {useCallback, useRef} from 'react';

export default function useStage(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useStageFn(fn) {
  const ref = useStage(fn);
  return useCallback((...params) => ref.current(...params), []);
}
