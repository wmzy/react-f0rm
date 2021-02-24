import {createContext, useContext} from 'react';

export const FormContext = createContext();

export const FormProvider = FormContext.Provider;

export function useFormContext() {
  const form = useContext(FormContext);
  if (!form) throw new Error('no form provided');
  return form;
}
