export {default as createForm} from './form';
export * from './form';
// `Form` can't be exported as a type here: the component of the same name
// shadows it, so consumers would get the component. Ship the interface
// under the ecosystem-standard alias (antd precedent).
export type {Form as FormInstance} from './form';
// Form.emitter is public API, so its handle type must be re-exported —
// otherwise rollup-plugin-dts leaves it private and isolatedDeclarations
// builds fail (TS2742).
export type {EventEmitter} from './emitter';
export type {
  FieldPath,
  AnyPath,
  PathValue,
  PathValueOf,
  ArrayItemOf,
  OpaqueTypes
} from './types';
// Type-only: zero runtime bytes; the resolvers entry re-exports it too.
export type {InferSchemaValues, StandardSchemaV1} from './standardSchema';
// 入口 d.ts 引用了 Path/PathSegments（UseFieldOptions 的验证相关类型经
// hooks/form 暴露，core 模块的泛型约束直接引用 PathSegments），
// 不公共导出的话 rollup-plugin-dts 会把它们留在私有 chunk 里，下游
// isolated declarations 场景报 TS2742。Validator/SyncValidator 由上面的
// `export * from './form'` 直接公共导出（定义已移居 core）。
export type {Path, PathSegments} from './path';

export * from './context';

export * from './hooks/form';
export {default as useForm} from './hooks/form';
export {default as useField} from './hooks/field';
export {default as useFieldArray, useFieldArrayItem} from './hooks/fieldArray';
export {default as useTransform} from './hooks/transform';
export type {UseTransformOptions} from './hooks/transform';
export type {FieldRules} from './rules';

export {subscribe, watch} from './subscribe';
export type {
  SubscribeOptions,
  SubscribeEvent,
  WatchScope,
  WatchHandle
} from './subscribe';

export {default as Form} from './components/Form';
export {default as FormField} from './components/FormField';
export * from './components/Field';
