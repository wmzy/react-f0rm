import {createContext, useContext} from 'react';

export const FormStoreContext = createContext();

export const FormStoreProvider = FormStoreContext.Provider;

export function useFormStore() {
  const store = useContext(FormStoreContext);
  if (!store) throw new Error('no form store provided');
  return store;
}
