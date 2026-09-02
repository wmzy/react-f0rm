export {default as createForm} from './form';
export * from './form';
// `Form` itself cannot be exported as a type here: the component value of
// the same name (components/Form) shadows it in the entry's namespace, so
// consumers get the component where they asked for the interface. Ship the
// interface under its ecosystem-standard alias instead (antd precedent).
export type {Form as FormInstance} from './form';
export type {FieldPath, PathValue, PathValueOf} from './types';
// 入口 d.ts 引用了这两个类型（UseFieldOptions.validate 等），不公共导出
// 的话 rollup-plugin-dts 会把它们留在私有 chunk 里，下游 isolated
// declarations 场景报 TS2742。
export type {Path} from './path';
export type {Validator} from './hooks/validate';

export * from './context';

export * from './hooks/form';
export {default as useForm} from './hooks/form';
export {default as useField} from './hooks/field';
export {default as useFieldArray, useFieldArrayItem} from './hooks/fieldArray';
export type {FieldRules} from './rules';

export {subscribe} from './subscribe';
export type {SubscribeOptions, SubscribeEvent, WatchScope} from './subscribe';

export {default as Form} from './components/Form';
export * from './components/Field';
