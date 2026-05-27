import {createContext, useContext} from 'react';

export const FormContext = createContext<any>(null);

export const FormProvider = FormContext.Provider;

export function useFormContext(): any {
  const form = useContext(FormContext);
  if (!form) throw new Error('no form provided');
  return form;
}

export const CheckboxGroupContext = createContext<any>(null);

export const CheckboxGroupProvider = CheckboxGroupContext.Provider;

export function useCheckboxGroupContext(): any {
  const group = useContext(CheckboxGroupContext);
  if (!group) throw new Error('no group provided');
  return group;
}
