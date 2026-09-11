import * as React from 'react';
import useField from '../hooks/field';
import type {UseFieldOptions, UseFieldResult} from '../hooks/field';
import type {FieldPath} from '../types';
import type {PathSegments} from '../path';

/** Every {@link UseFieldOptions} option plus a render-prop `children`
 * receiving the bound field result. */
export type FormFieldProps<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments
> = UseFieldOptions<TValues, TPath> & {
  children: (field: UseFieldResult<TValues, TPath>) => React.ReactNode;
};

/** Headless field via a render prop — the non-hook {@link useField} for
 * class components/callback consumers. The child receives the full
 * {@link UseFieldResult}; resolves its form from FormContext or the
 * `form` option. */
export default function FormField<
  TValues extends Record<string, any> = any,
  TPath extends FieldPath<TValues> | PathSegments =
    FieldPath<TValues> | PathSegments
>({children, ...options}: FormFieldProps<TValues, TPath>): React.ReactNode {
  const field = useField<TValues, TPath>(options);
  return children(field);
}
