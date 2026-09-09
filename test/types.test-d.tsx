// Compile-time assertions for the typing-ergonomics surface: the default
// context path is typed (`useFormContext<Values>()` -> `Form<Values>`),
// `<Form context={Ctx.context}>` interoperates with createFormContext, a
// `Field`/`Checkbox`/`Select` tied to a typed form infers its `validate`
// value argument from the path (`PathValueOf<Values, P>`), and the `<Form>`
// submit callbacks declare their awaited Promise return. Not a vitest
// file — the `.test-d.` name is the tsd convention and matches no vitest
// include pattern; the file is wired into tsconfig `include` instead, so
// CI's `npx tsc --noEmit` compiles and enforces every assertion (same
// `Equal`/`Expect` self-check style as src/types.ts).
//
// Semantics note: on the generic path APIs (useField, Ctx.useField,
// setValue/getValue/...), a path that is not in `FieldPath<Values>` — a
// typo'd literal or a plain `string` variable — fails at compile time
// (react-hook-form parity); segment arrays (`['a', 0]`) stay accepted and
// read as `any`. Deliberately dynamic entry points — `useFieldArray`,
// `removeField`, `trigger`, `setFocus`, `clearErrors` — keep the wide
// `Name` type so runtime-computed names stay usable without casts. Every
// Equal check below tells `any` and the real type apart.
import * as React from 'react';
import {
  Form,
  Field,
  Checkbox,
  Select,
  useFormContext,
  useValue,
  createForm,
  createFormContext,
  type FormInstance,
  useFieldArrayItem,
  useFieldArray,
  useField,
  getValue,
  setValue,
  appendValue,
  prependValue,
  insertValue,
  removeValue,
  moveValue,
  swapValues,
  replaceValues,
  updateValue,
  type FieldPath,
  type PathValueOf,
  type FieldError,
  type InferSchemaValues
} from '../src/index';

interface LoginValues {
  email: string;
  password: string;
  profile: {bio?: string};
  tags: string[];
  remember: boolean;
}

// Equal tells `any` and `string` apart, unlike plain assignability checks.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

// ---- goal 1: the default context path is typed -------------------------------

function LoginEmailSummary() {
  const form = useFormContext<LoginValues>();
  const email = useValue(form, 'email');
  const checks: [
    Expect<Equal<typeof form, FormInstance<LoginValues>>>,
    Expect<Equal<typeof email, string>>
  ] = [true, true];
  return <input value={checks[0] ? email : ''} readOnly />;
}

// ---- goal 1b: <Form> interoperates with createFormContext ---------------------

const ProfileForm = createFormContext<LoginValues>();

function ProfileEmailField() {
  const {value} = ProfileForm.useField({name: 'email'});
  const typed: Expect<Equal<typeof value, string>> = true;
  return <input value={typed ? value : ''} readOnly />;
}

// The raw context routes <Form>'s managed form into the isolated bundle.
function IsolatedProfileForm() {
  return (
    <Form
      context={ProfileForm.context}
      initialValues={{email: '', password: ''}}
    >
      <ProfileEmailField />
    </Form>
  );
}

// ---- goal 2: Field validate argument inference via the form prop --------------

const loginForm = createForm<LoginValues>({
  initialValues: {
    email: '',
    password: '',
    profile: {},
    tags: [],
    remember: false
  }
});

const dynamicName: string = 'untyped';

function CustomInput(props: Record<string, any>) {
  return <input {...props} />;
}

function TypedFields() {
  return (
    <Form form={loginForm}>
      {/* top-level: string */}
      <Field
        form={loginForm}
        name="email"
        validate={value => {
          const check: Expect<Equal<typeof value, string>> = true;
          return check && value.length === 0 ? 'Email is required' : undefined;
        }}
      />
      {/* nested optional: string | undefined */}
      <Field
        form={loginForm}
        name="profile.bio"
        validate={value => {
          const check: Expect<Equal<typeof value, string | undefined>> = true;
          return check && value === undefined ? 'Tell us something' : undefined;
        }}
      />
      {/* array: string[] */}
      <Field
        form={loginForm}
        name="tags"
        validate={value => {
          const check: Expect<Equal<typeof value, string[]>> = true;
          return check && value.length === 0 ? 'At least one tag' : undefined;
        }}
      />
      {/* `as` components keep working with arbitrary props */}
      <Field
        form={loginForm}
        name="email"
        as={CustomInput}
        label="Email"
        validate={value => (value.includes('@') ? undefined : 'Invalid email')}
      />
      {/* Checkbox/Select share the same form-typed validate inference */}
      <Checkbox
        form={loginForm}
        name="remember"
        validate={value => {
          const check: Expect<Equal<typeof value, boolean>> = true;
          return check || value ? undefined : 'Required';
        }}
      />
      <Select
        form={loginForm}
        name="email"
        validate={value => {
          const check: Expect<Equal<typeof value, string>> = true;
          return check && value === '' ? 'Email is required' : undefined;
        }}
      />
      {/* value is string, NOT any: arithmetic on it is a type error. Had
         inference fallen back to `any`, this line would compile. */}
      <Field
        form={loginForm}
        name="email"
        validate={value =>
          // @ts-expect-error string * number is not a valid validate body
          value * 2 ? 'unreachable' : undefined
        }
      />
      {/* backward compat: without a typed form, validate stays permissive
         (dynamic/untyped names degrade to `any`, same as useField) */}
      <Field
        name={dynamicName}
        validate={value => {
          const permissive: any = value;
          return permissive ? undefined : 'Required';
        }}
      />
    </Form>
  );
}

// ---- goal 3: <Form> submit callbacks may be async -----------------------------

// The submit flow (`handleSubmit`) awaits onSubmit/onValidSubmit, so
// isSubmitting covers the whole async flight; the props must declare the
// Promise return (mirroring HandleSubmitOptions) instead of `=> void`,
// which hides that the await is part of the contract. ReturnType of the
// resolved prop is the exact-shape check: an async handler is assignable
// to `=> void`, so only this fails on the old declaration.
type FormPropsOf = React.ComponentProps<typeof Form>;
type ExpectAsyncSubmit = Expect<
  Equal<ReturnType<NonNullable<FormPropsOf['onSubmit']>>, void | Promise<void>>
>;
type ExpectAsyncValidSubmit = Expect<
  Equal<
    ReturnType<NonNullable<FormPropsOf['onValidSubmit']>>,
    void | Promise<void>
  >
>;
// onInvalidSubmit is NOT awaited — it must stay `=> void`.
type ExpectSyncInvalidSubmit = Expect<
  Equal<ReturnType<NonNullable<FormPropsOf['onInvalidSubmit']>>, void>
>;

// Usage side: async handlers type-check against a typed form and see the
// typed values (loginForm is Form<LoginValues> from goal 2).
function AsyncSubmitForm() {
  return (
    <Form
      form={loginForm}
      onSubmit={async values => {
        const check: Expect<Equal<typeof values.email, string>> = true;
        await Promise.resolve(check);
      }}
      onValidSubmit={async (values, e) => {
        const event: Expect<Equal<typeof e, React.FormEvent>> = true;
        await Promise.resolve(values.remember && event);
      }}
    >
      <Field name="email" />
      <button type="submit">Save</button>
    </Form>
  );
}

// ---- goal 4: useCanSubmit + form-level validateDebounce typing ----------------

import {useCanSubmit, useForm} from '../src/index';

function CanSubmitButton() {
  const form = useForm<LoginValues>({
    initialValues: {
      email: '',
      password: '',
      profile: {},
      tags: [],
      remember: false
    }
  });
  const canSubmit = useCanSubmit(form);
  const typed: Expect<Equal<typeof canSubmit, boolean>> = true;
  return <button disabled={!canSubmit || !typed}>Submit</button>;
}

// Form-level validate: the meta second argument is optional at the
// declaration site, so legacy single-argument callbacks stay assignable,
// and validateDebounce is milliseconds (numbers only).
const legacyValidator = (values: LoginValues) =>
  values.email ? undefined : {email: 'required'};
const metaValidator = async (
  values: LoginValues,
  {signal}: {form: FormInstance<LoginValues>; signal: AbortSignal}
) => {
  const res = await fetch(`/api/check?email=${values.email}`, {signal});
  return res.ok ? undefined : {email: 'taken'};
};
const debouncedForm = createForm<LoginValues>({
  validate: legacyValidator,
  validateDebounce: 300
});
const withMetaForm = createForm<LoginValues>({validate: metaValidator});
const debounceOptionType: Expect<
  Equal<typeof debouncedForm.validateDebounce, number | undefined>
> = true;
// @ts-expect-error validateDebounce is milliseconds — numbers only
createForm<LoginValues>({validateDebounce: '300'});
void [withMetaForm, debounceOptionType];

// ---- goal 5: useFieldArrayItem row typing -------------------------------------

// The row hook's TValue defaults to any (dynamic rows stay usable); an
// explicit generic types value/setValue and the closed result shape keeps
// typo'd property access a compile error.
function TagRow() {
  const form = useForm<LoginValues>();
  const anyRow = useFieldArrayItem({name: 'tags', id: '_1', form});
  const anyValue: Expect<Equal<typeof anyRow.value, any>> = true;
  const typedRow = useFieldArrayItem<string>({name: 'tags', id: '_1', form});
  const typedValue: Expect<Equal<typeof typedRow.value, string>> = true;
  const rowName: Expect<Equal<typeof typedRow.name, string>> = true;
  const rowIndex: Expect<Equal<typeof typedRow.index, number>> = true;
  const rowErrors: Expect<Equal<typeof typedRow.errors, FieldError[]>> = true;
  typedRow.setValue('x');
  // @ts-expect-error setValue takes the declared row value type
  typedRow.setValue(1);
  void [anyValue, typedValue, rowName, rowIndex, rowErrors];
  return null;
}

// ---- goal 6: typo'd paths fail at compile time -------------------------------

// The generic path APIs constrain names to FieldPath<Values> | PathSegments,
// so a typo'd literal errors at the call site instead of degrading to `any`.
function TypoGuards() {
  const form = useForm<LoginValues>({initialValues: loginForm.initialValues});
  // @ts-expect-error 'emial' is not a field path of LoginValues
  setValue(form, 'emial', 'x');
  // @ts-expect-error 'emial' is not a field path of LoginValues
  getValue(form, 'emial');
  // @ts-expect-error 'emial' is not a field path of LoginValues
  useField({form, name: 'emial'});
  // @ts-expect-error 'emial' is not a field path of LoginValues
  ProfileForm.useField({name: 'emial'});
  // @ts-expect-error 'emial' is not a field path of LoginValues
  useValue(form, 'emial');
  // @ts-expect-error plain `string` variables must be cast or narrowed too
  setValue(form, dynamicName, 'x');
  // Correct paths still infer the exact value type (regression guard).
  const email: string = getValue(form, 'email');
  const bio: string | undefined = getValue(form, 'profile.bio');
  // Segment arrays stay dynamic: PathValueOf falls back to `any`.
  const segPath: (string | number)[] = ['profile', 'bio'];
  const segValue: any = getValue(form, segPath);
  // The deliberately dynamic entry points keep accepting runtime strings.
  const arr = useFieldArray({name: dynamicName, form});
  void [email, bio, segValue, arr];
  return null;
}

// ---- goal 7: headless useField validate argument inference -------------------

// The `validate` value argument follows the path on the hook API too
// (PathValueOf<TValues, TPath>), not only on Field/Checkbox/Select —
// TanStack-parity inference for headless consumers.
function TypedUseFieldValidate() {
  const form = useForm<LoginValues>({initialValues: loginForm.initialValues});
  const {value} = useField({
    form,
    name: 'profile.bio',
    validate: v => {
      const check: Expect<Equal<typeof v, string | undefined>> = true;
      return check && !v ? 'Bio is required' : undefined;
    }
  });
  const typedValue: Expect<Equal<typeof value, string | undefined>> = true;
  // The scoped context bundle's useField narrows identically.
  const {value: ctxValue} = ProfileForm.useField({
    name: 'remember',
    validate: v => {
      const check: Expect<Equal<typeof v, boolean>> = true;
      return check || v ? undefined : 'Required';
    }
  });
  const typedCtxValue: Expect<Equal<typeof ctxValue, boolean>> = true;
  // @ts-expect-error validate value is typed — arithmetic on a string fails
  useField({form, name: 'email', validate: v => (v * 2 ? 'x' : undefined)});
  // FormField (the render-prop bridge) inherits the same narrowing.
  void [typedValue, typedCtxValue];
  return null;
}

// Backward compat: without a typed form (context-resolved or dynamic name)
// the validate value stays `any`, like Field's untyped call sites.
function PermissiveUseFieldValidate() {
  useField({
    name: dynamicName,
    validate: v => {
      const permissive: any = v;
      return permissive ? undefined : 'Required';
    }
  });
  return null;
}

void PermissiveUseFieldValidate;

// ---- goal 8: Standard Schema → TValues inference ------------------------------

interface MockSchema<In, Out> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'mock';
    readonly validate: (
      v: In
    ) => {readonly value: Out} | {readonly issues: readonly never[]};
    readonly types: {readonly input: In; readonly output: Out};
  };
}
declare const userSchema: MockSchema<unknown, {email: string; age: number}>;

// InferSchemaValues resolves the schema's output type (the coerced side of
// the input/output split).
type SchemaUserValues = InferSchemaValues<typeof userSchema>;
const schemaUserValues: [
  Expect<Equal<SchemaUserValues, {email: string; age: number}>>,
  Expect<Equal<keyof SchemaUserValues, 'email' | 'age'>>
] = [true, true];
void schemaUserValues;

// A schema without a types entry infers never — pass an explicit generic.
type NoTypesSchema = InferSchemaValues<{
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'x';
    readonly validate: (v: any) => any;
  };
}>;
const noTypesSchema: Expect<Equal<NoTypesSchema, never>> = true;
void noTypesSchema;

// createForm({validate: schema}) infers Form<schema output> — no generic.
const schemaForm = createForm({validate: userSchema});
const schemaFormChecks: [
  Expect<Equal<typeof schemaForm, FormInstance<SchemaUserValues>>>
] = [true];
void schemaFormChecks;
setValue(schemaForm, 'email', 'a@b.c');
setValue(schemaForm, 'age', 42);
// @ts-expect-error typo paths fail on the inferred shape
setValue(schemaForm, 'emial', 'x');
// @ts-expect-error the value type resolves from the inferred path
setValue(schemaForm, 'age', 'not-a-number');

// Function validators keep inferring from the values parameter.
const fnForm = createForm({
  validate: (v: {a: number}) => (v.a > 0 ? undefined : {a: 'must be positive'})
});
setValue(fnForm, 'a', 1);
// @ts-expect-error typo paths still fail on the inferred shape
setValue(fnForm, 'b', 1);
void fnForm;

// Field-level schema: the validate option accepts a Standard Schema whose
// output matches the path's value type.
declare const emailSchema: MockSchema<unknown, string>;
function SchemaValidateField() {
  useField({name: 'email', validate: emailSchema});
  return null;
}
void SchemaValidateField;

// ---- goal 12: OpaqueTypes leaf registry ---------------------------------------

// A private brand keeps the test-only registration from matching any other
// type structurally, so the rest of the program's path checks stay intact.
declare class OpaqueTest {
  private brand: void;
}
declare module '../src/types' {
  interface OpaqueTypes {
    opaqueTest: OpaqueTest;
  }
}

function OpaqueGuards() {
  type Shape = {stamp: OpaqueTest; wrapper: {inner: OpaqueTest}};
  // The opaque leaf is a valid path resolving to the leaf type itself…
  const stamp: Expect<Equal<PathValueOf<Shape, 'stamp'>, OpaqueTest>> = true;
  const stampInList: Expect<'stamp' extends FieldPath<Shape> ? true : false> =
    true;
  // …and path enumeration stops there: descending into the leaf is not a
  // path (the fallback reads as `any`), while the sibling subtree still
  // enumerates.
  const deepFallback: Expect<Equal<PathValueOf<Shape, 'stamp.brand'>, any>> =
    true;
  const siblingDescends: Expect<
    'wrapper[inner]' extends FieldPath<Shape> ? true : false
  > = true;
  void [stamp, stampInList, deepFallback, siblingDescends];
  return null;
}

// ---- goal 13: typed array movers -------------------------------------------------

type Item = {qty: number; label?: string};
declare const itemsForm: FormInstance<LoginValues & {items: Item[]}>;
void itemsForm;

// useFieldArray<Item> types every mover's value argument.
function TypedArrayMovers() {
  const {append, prepend, insert, replace, update} = useFieldArray<Item>({
    name: 'items',
    form: itemsForm
  });
  const appendType: Expect<Equal<Parameters<typeof append>[0], Item>> = true;
  const prependType: Expect<Equal<Parameters<typeof prepend>[0], Item>> = true;
  const insertType: Expect<Equal<Parameters<typeof insert>[1], Item>> = true;
  const replaceType: Expect<Equal<Parameters<typeof replace>[0], Item[]>> =
    true;
  const updateType: Expect<Equal<Parameters<typeof update>[1], Item>> = true;
  append({qty: 1});
  // @ts-expect-error append takes an Item, not a string
  append('nope');
  // @ts-expect-error update takes an Item, not a string
  update(0, 'nope');
  // Unparameterized calls stay `any` (back-compat with untyped call sites).
  const loose = useFieldArray({name: dynamicName, form: itemsForm});
  const looseAppend: Expect<Equal<Parameters<typeof loose.append>[0], any>> =
    true;
  void [
    appendType,
    prependType,
    insertType,
    replaceType,
    updateType,
    looseAppend
  ];
  return null;
}

// createFormContext bundles accept the item generic the same way.
const ItemForm = createFormContext<LoginValues & {items: Item[]}>();
function CtxTypedArrayMovers() {
  const {append} = ItemForm.useFieldArray<Item>({name: 'items'});
  const appendType: Expect<Equal<Parameters<typeof append>[0], Item>> = true;
  // @ts-expect-error append takes an Item, not a number
  append(1);
  void appendType;
  return null;
}

// Headless array ops type the value from the path: LoginValues.tags is
// string[], so a non-string value is rejected.
function HeadlessArrayOps(form: FormInstance<LoginValues>) {
  appendValue(form, 'tags', 'x');
  prependValue(form, 'tags', 'x');
  insertValue(form, 'tags', 0, 'x');
  replaceValues(form, 'tags', ['x']);
  updateValue(form, 'tags', 0, 'x');
  // @ts-expect-error tags holds strings, not numbers
  appendValue(form, 'tags', 42);
  // @ts-expect-error tags holds strings, not objects
  updateValue(form, 'tags', 0, {bad: true});
  // Segment arrays stay the wide escape hatch: value reads as any.
  appendValue(form, ['tags'], 42);
  // Plain `string` variables fail the path constraint like setValue's.
  // @ts-expect-error dynamic string names must be cast or narrowed
  appendValue(form, dynamicName, 'x');
  // removeValue accepts one index or a list.
  removeValue(form, 'tags', 0);
  removeValue(form, 'tags', [0, 1]);
  // @ts-expect-error remove indices are numbers
  removeValue(form, 'tags', '0');
  moveValue(form, 'tags', 0, 1);
  swapValues(form, 'tags', 0, 1);
  return null;
}

declare const opaqueForm: FormInstance<{stamp: OpaqueTest}>;
// @ts-expect-error descending into an opaque leaf is not a path
getValue(opaqueForm, 'stamp.brand');
void opaqueForm;
