export {default as createForm} from './form';
export * from './form';
// `Form` itself cannot be exported as a type here: the component value of
// the same name (components/Form) shadows it in the entry's namespace, so
// consumers get the component where they asked for the interface. Ship the
// interface under its ecosystem-standard alias instead (antd precedent).
export type {Form as FormInstance} from './form';
export type {FieldPath, PathValue, PathValueOf} from './types';

export * from './context';

export * from './hooks/form';
export {default as useForm} from './hooks/form';
export {default as useField} from './hooks/field';
export {default as useFieldArray} from './hooks/fieldArray';

export {default as Form} from './components/Form';
export * from './components/Field';
