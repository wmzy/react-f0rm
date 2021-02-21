import {useEffect, useMemo} from 'react';
import {useFormStore} from '../context';
import {removeField, setValue} from '../store';
import {useValue} from './form';

export default function useField({name, defaultValue}) {
  const store = useFormStore();

  useMemo(() => {
    setValue(store, name, defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, store]);

  useEffect(
    () => () => {
      removeField(store, name);
    },
    [name, store]
  );

  const value = useValue(store, name);
  const onChange = v => setValue(store, name, v);
  return {value, onChange};
}
