import {
  createContext,
  createElement,
  useContext,
  type ComponentType,
  type ReactNode
} from 'react';
import {
  useFieldCore,
  type UseFieldOptions,
  type UseFieldResult
} from './hooks/field';
import {useFieldArrayCore, type UseFieldArrayResult} from './hooks/fieldArray';
import type {Form} from './form';
import type {Name} from './path';
import type {FieldPath} from './types';

export const FormContext = createContext<any>(null);

export const FormProvider = FormContext.Provider;

/**
 * Read the form from the module-level {@link FormContext}. Pass the values
 * shape — `useFormContext<Values>()` — to get a fully typed `Form<Values>`
 * headless API; the `any` default keeps untyped call sites compiling.
 *
 * For multiple forms in one subtree use {@link createFormContext} instead.
 *
 * @throws when no `<FormProvider>` is mounted above the call site.
 */
export function useFormContext<T extends Record<string, any> = any>(): Form<T> {
  const form = useContext(FormContext);
  if (!form) throw new Error('no form provided');
  return form;
}

/**
 * Create an isolated bundle of form-context bindings: its own React context
 * plus `useField` / `useFieldArray` / `useFormContext` hooks that resolve
 * their form from it.
 *
 * Why: the module-level {@link FormContext} works fine for a single form per
 * subtree, but nesting two forms (or reusing a component inside a different
 * form) makes them fight over one context. Calling this factory once per app
 * area — `const Ctx = createFormContext<Values>()` — fixes the value shape
 * (`Ctx.useField({name: 'user.name'})` gets its `name` constrained by
 * `FieldPath<Values>` and its `value` typed accordingly), so call sites stop
 * hand-writing generics, and each instance's Provider scopes a strictly
 * separate form.
 */
export function createFormContext<TValues extends Record<string, any> = any>() {
  const Context = createContext<Form<TValues> | null>(null);

  // A `form`-prop wrapper instead of exposing Context.Provider directly:
  // callers shouldn't have to know about the raw `value` prop shape.
  function FormProvider({
    form,
    children
  }: {
    form: Form<TValues>;
    children: ReactNode;
  }): ReactNode {
    return createElement(Context.Provider, {value: form}, children);
  }

  function useFormContext(): Form<TValues> {
    const form = useContext(Context);
    if (!form) throw new Error('no form provided');
    return form;
  }

  function useField<TPath extends FieldPath<TValues> | Name = Name>(
    // The bare `{name: TPath}` member keeps `name` a direct inference site
    // for TPath instead of routing it through the mapped Omit type.
    // `form` is omitted on purpose — the form always comes from this
    // factory's own Context.
    options: {name: TPath} & Omit<UseFieldOptions<TValues, TPath>, 'form'>
  ): UseFieldResult<TValues, TPath> {
    return useFieldCore(options as UseFieldOptions<TValues, TPath>, Context);
  }

  function useFieldArray(options: {
    name: FieldPath<TValues> | Name;
  }): UseFieldArrayResult {
    return useFieldArrayCore(options as {name: Name}, Context);
  }

  return {FormProvider, useFormContext, useField, useFieldArray};
}

export const CheckboxGroupContext = createContext<any>(null);

export const CheckboxGroupProvider = CheckboxGroupContext.Provider;

export function useCheckboxGroupContext(): any {
  const group = useContext(CheckboxGroupContext);
  if (!group) throw new Error('no group provided');
  return group;
}
