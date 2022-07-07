import {createContext, useContext} from 'react';

export const FormContext = createContext(null);

export const FormProvider = FormContext.Provider;

export function useFormContext() {
  const form = useContext(FormContext);
  if (!form) throw new Error('no form provided');
  return form;
}

export const CheckboxGroupContext = createContext(null);

export const CheckboxGroupProvider = CheckboxGroupContext.Provider;

export function useCheckboxGroupContext() {
  const group = useContext(CheckboxGroupContext);
  if (!group) throw new Error('no group provided');
  return group;
}
