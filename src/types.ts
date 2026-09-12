/** Compile-time field path utilities: `FieldPath<T>` enumerates valid
 * path strings, `PathValue<T, P>` resolves the leaf type. Grammar mirrors
 * `normalizePath`: numeric segments are bracket-only ('a[0]', never
 * 'a.0' — dotted numerics throw at runtime). */
import type {PathSegments} from './path';

/** `true` only for the `any` type (`0 extends 1 & any`). */
type IsAny<T> = 0 extends 1 & T ? true : false;

type Primitive = null | undefined | string | number | boolean | symbol | bigint;

/** Opt-in registry of value types the path types treat as opaque leaves:
 * `FieldPath<T>` stops descending into them, `PathValue` resolves the
 * field itself to that type. Merge via declaration merging
 * (`interface OpaqueTypes { date: Date }`). Empty by default, so every
 * object leaf stays navigable. */

export interface OpaqueTypes {}

/** Union of every registered leaf type — `never` until an app merges entries. */
type OpaqueLeaf = OpaqueTypes[keyof OpaqueTypes];

/** Depth countdown: Prev[9] = 8 ... Prev[1] = 0, Prev[0] = never stops recursion. */
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Paths are capped at 10 segments to keep instantiation depth bounded. */
type MaxDepth = 9;

/** Valid path continuations after a segment: `.k` / `[k]` / `[0]`, then
 * deeper continuations. Numeric segments are bracket-only; numeric-string
 * keys likewise enumerate just the bracket subscript. */
type Continue<T, D extends number> = [D] extends [never]
  ? never
  : IsAny<T> extends true
    ? string
    : T extends OpaqueLeaf | Primitive | Function
      ? never
      : T extends readonly (infer U)[]
        ? `[${number}]` | `[${number}]${Continue<U, Prev[D]>}`
        : {
            [K in Extract<keyof T, string>]:
              | (K extends `${number}` ? never : `.${K}`)
              | `[${K}]`
              | (K extends `${number}`
                  ? never
                  : `.${K}${Continue<T[K], Prev[D]>}`)
              | `[${K}]${Continue<T[K], Prev[D]>}`;
          }[Extract<keyof T, string>];

/** Every valid field path string for a values shape `T`. Capped at 10
 * segments ({@link MaxDepth}); beyond the cap call sites fall back to
 * `any`. {@link OpaqueTypes} entries stop recursion entirely.
 * @example FieldPath<{a: {b: string}}> // 'a' | 'a.b' | 'a[b]' */
export type FieldPath<T> =
  IsAny<T> extends true
    ? string
    : T extends OpaqueLeaf | Primitive | Function
      ? never
      : T extends readonly (infer U)[]
        ? `[${number}]` | `[${number}]${Continue<U, MaxDepth>}`
        : {
            [K in Extract<keyof T, string>]: K extends `${number}`
              ? never
              : K | `${K}${Continue<T[K], MaxDepth>}`;
          }[Extract<keyof T, string>];

/** Field address as the hooks and components accept it: a typed path
 * string or a raw segments array ({@link PathSegments}). */
export type AnyPath<T> = FieldPath<T> | PathSegments;

/** Resolve `T[K]` for one bare segment: array index -> element, object key -> value. */
type Lookup<T, K extends string> = K extends `${number}`
  ? T extends readonly (infer U)[]
    ? U
    : never
  : K extends keyof T
    ? T[K]
    : never;

/** One dot-separated chunk: a bare segment plus any `[k]` / `[0]` suffixes. */
type ChunkValue<T, C extends string> = C extends `${infer Key}[${infer Tail}`
  ? ChunkSuffix<Lookup<T, Key>, `[${Tail}`>
  : Lookup<T, C>;

type ChunkSuffix<T, S extends string> = S extends `[${infer Key}]${infer Rest}`
  ? Rest extends ''
    ? Lookup<T, Key>
    : PathOf<Lookup<T, Key>, Rest>
  : never;

/** Resolve the value type the path string `P` points at inside `T`. */
type PathOf<T, P extends string> = P extends ''
  ? never
  : P extends `[${infer Key}]${infer Rest}`
    ? Rest extends ''
      ? Lookup<T, Key>
      : PathOf<Lookup<T, Key>, Rest>
    : P extends `.${infer Rest}`
      ? PathOf<T, Rest>
      : P extends `${infer Chunk}.${infer Rest}`
        ? PathOf<ChunkValue<T, Chunk>, Rest>
        : ChunkValue<T, P>;

/** The value type at path `P` of a values shape `T`.
 * @example PathValue<{a: {b: string}}, 'a.b'> // string */
export type PathValue<T, P extends FieldPath<T>> = PathOf<T, P & string>;

type ResolvedPathValue<T, P> = PathValue<T, Extract<P, FieldPath<T>>>;

/** The value type at `P`, or `any` when `P` is not a known field path
 * (plain `string` / segment-array calls keep their old behavior). */
export type PathValueOf<T, P> =
  P extends FieldPath<T> ? ResolvedPathValue<T, P> : any;

/** Element type of the array a path points at; non-array leaves resolve
 * to themselves, unknown paths fall back to `any`. */
export type ArrayItemOf<T, P> =
  P extends FieldPath<T>
    ? ResolvedPathValue<T, P> extends readonly (infer U)[]
      ? U
      : ResolvedPathValue<T, P>
    : any;

// ---- compile-time self-checks (enforced by `tsc --noEmit`, zero runtime cost) ----
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type Check<T extends true> = T;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 编译期自检：类型存在本身即断言，由 tsc --noEmit 强制
type SelfCheckPath = {
  containsDotted: Check<
    'a.b' extends FieldPath<{a: {b: string}}> ? true : false
  >;
  containsBracketKey: Check<
    'a[b]' extends FieldPath<{a: {b: string}}> ? true : false
  >;
  containsBracketIndex: Check<
    'a[0].c' extends FieldPath<{a: {c: number}[]}> ? true : false
  >;
  rejectsDotIndex: Check<
    'a.0.c' extends FieldPath<{a: {c: number}[]}> ? false : true
  >;
  rejectsUnknownPath: Check<
    'a.z' extends FieldPath<{a: {b: string}}> ? false : true
  >;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 编译期自检：类型存在本身即断言，由 tsc --noEmit 强制
type SelfCheckValue = {
  dottedLeaf: Check<Equal<PathValue<{a: {b: string}}, 'a.b'>, string>>;
  bracketLeaf: Check<Equal<PathValue<{a: {b: string}}, 'a[b]'>, string>>;
  indexLeaf: Check<Equal<PathValue<{a: {c: number}[]}, 'a[0].c'>, number>>;
  bracketRootLeaf: Check<Equal<PathValue<{c: number}[], '[0].c'>, number>>;
  intermediateNode: Check<Equal<PathValue<{a: {b: string}}, 'a'>, {b: string}>>;
  arrayItself: Check<Equal<PathValue<{a: {c: number}[]}, 'a'>, {c: number}[]>>;
  arrayElement: Check<Equal<PathValue<{a: string[]}, 'a[1]'>, string>>;
};
