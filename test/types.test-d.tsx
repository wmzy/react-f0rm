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
// Semantics note: unknown path literals (or plain `string` names) keep the
// `useField` contract — PathValueOf degrades to `any`, it does not error —
// so dynamic names stay usable; every Equal check below tells `any` and the
// real type apart.
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
  type FieldError
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
