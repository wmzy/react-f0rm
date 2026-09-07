import * as React from 'react';
import useField from '../hooks/field';
import type {UseFieldOptions, UseFieldResult} from '../hooks/field';
import type {FieldPath} from '../types';
import type {Name} from '../path';

/**
 * Props for {@link FormField}: every {@link UseFieldOptions} option plus a
 * render-prop `children` receiving the bound field result.
 */
export type FormFieldProps<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
> = UseFieldOptions<TValues, TPath> & {
  children: (field: UseFieldResult<TValues, TPath>) => React.ReactNode;
};

/**
 * Headless field bound through a render prop — the non-hook counterpart of
 * {@link useField} for class components, callback-style consumers and
 * library bridges where a hook cannot be called (Formik `<Field>` /
 * TanStack `form.Field` shape).
 *
 * The child function receives the full {@link UseFieldResult} — value,
 * error(s), onChange/onBlur, `disabled`, `focusRef`, the bound `form` —
 * and renders whatever UI it wants; nothing is rendered when it returns
 * null/undefined, so it can also gate conditional layout. Resolves its
 * form from the module-level `FormContext` or the explicit `form` option
 * (per-instance contexts from `createFormContext()` keep using their own
 * `useField` hook).
 */
export default function FormField<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | Name = Name
>({children, ...options}: FormFieldProps<TValues, TPath>): React.ReactNode {
  const field = useField<TValues, TPath>(options);
  return children(field);
}
