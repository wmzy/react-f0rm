import {
  createContext,
  createElement,
  useContext,
  type Context,
  type Provider,
  type ReactNode
} from 'react';
import {
  useFieldCore,
  type UseFieldOptions,
  type UseFieldResult
} from './hooks/field';
import {
  useFieldArrayCore,
  useFieldArrayItemCore,
  type UseFieldArrayOptions,
  type UseFieldArrayResult,
  type UseFieldArrayItemResult
} from './hooks/fieldArray';
import type {FieldRules} from './rules';
import type {Form} from './form';
import type {Name, PathSegments} from './path';
import type {FieldPath} from './types';

export const FormContext: Context<Form<any> | null> =
  createContext<Form<any> | null>(null);

export const FormProvider: Provider<Form<any> | null> = FormContext.Provider;

/**
 * Read the form from the module-level {@link FormContext}; pass the values
 * shape (`useFormContext<Values>()`) for a typed `Form<Values>`. Use
 * {@link createFormContext} for multiple forms in one subtree.
 * @throws when no `<FormProvider>` is mounted above the call site.
 */
export function useFormContext<T extends Record<string, any> = any>(): Form<T> {
  const form = useContext(FormContext);
  if (!form) throw new Error('no form provided');
  return form;
}

/** The bundle {@link createFormContext} returns: a private React context
 * plus the hooks pre-bound to it, all typed against `TValues`. */
export type FormContextBundle<TValues extends Record<string, any> = any> = {
  /** The raw React context, for `<Form context={...}>`: the component
   * keeps its submit machinery while providing into this instance's
   * private context. */
  context: Context<Form<TValues> | null>;
  FormProvider: (props: {
    form: Form<TValues>;
    children: ReactNode;
  }) => ReactNode;
  useFormContext: () => Form<TValues>;
  useField: <
    TPath extends FieldPath<TValues> | PathSegments =
      FieldPath<TValues> | PathSegments
  >(
    options: {name: TPath} & Omit<UseFieldOptions<TValues, TPath>, 'form'>
  ) => UseFieldResult<TValues, TPath>;
  useFieldArray: <TItem = any, K extends string = 'id'>(options: {
    name: FieldPath<TValues> | Name;
    keyName?: K;
    rules?: FieldRules;
    shouldUnregister?: boolean;
  }) => UseFieldArrayResult<TItem, K>;
  useFieldArrayItem: <TValue = any>(options: {
    name: FieldPath<TValues> | Name;
    id: string;
  }) => UseFieldArrayItemResult<TValue>;
};

/**
 * Create an isolated bundle of form-context bindings: its own React context
 * plus `useField`/`useFieldArray`/`useFieldArrayItem`/`useFormContext`
 * hooks resolving from it. One factory per app area scopes a separate
 * form and fixes the value shape (`Ctx.useField` gets typed `name`/`value`);
 * `Ctx.context` lets `<Form context={Ctx.context}>` provide into it.
 */
export function createFormContext<
  TValues extends Record<string, any> = any
>(): FormContextBundle<TValues> {
  const Context = createContext<Form<TValues> | null>(null);

  // A `form`-prop wrapper, not a raw Context.Provider: callers shouldn't
  // have to know the `value` prop shape.
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

  function useField<
    TPath extends FieldPath<TValues> | PathSegments =
      FieldPath<TValues> | PathSegments
  >(
    // `{name: TPath}` keeps `name` a direct TPath inference site; `form` is
    // omitted — the form always comes from this factory's own Context.
    options: {name: TPath} & Omit<UseFieldOptions<TValues, TPath>, 'form'>
  ): UseFieldResult<TValues, TPath> {
    return useFieldCore(options as UseFieldOptions<TValues, TPath>, Context);
  }

  function useFieldArray<TItem = any, K extends string = 'id'>(options: {
    name: FieldPath<TValues> | Name;
    keyName?: K;
    rules?: FieldRules;
    shouldUnregister?: boolean;
  }): UseFieldArrayResult<TItem, K> {
    return useFieldArrayCore<TItem, K>(
      options as UseFieldArrayOptions<K>,
      Context
    );
  }

  function useFieldArrayItem<TValue = any>(options: {
    name: FieldPath<TValues> | Name;
    id: string;
  }): UseFieldArrayItemResult<TValue> {
    return useFieldArrayItemCore(options as {name: Name; id: string}, Context);
  }

  // The raw context, for `<Form context={...}>`: the component keeps its
  // submit machinery while providing into this instance's context.
  return {
    context: Context,
    FormProvider,
    useFormContext,
    useField,
    useFieldArray,
    useFieldArrayItem
  };
}

export const CheckboxGroupContext: Context<any> = createContext<any>(null);

export const CheckboxGroupProvider: Provider<any> =
  CheckboxGroupContext.Provider;

export function useCheckboxGroupContext(): any {
  const group = useContext(CheckboxGroupContext);
  if (!group) throw new Error('no group provided');
  return group;
}
