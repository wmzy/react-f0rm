import {useRef} from 'react';

export default function useStage(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
