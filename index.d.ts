declare const __DEV__: boolean;

export type Validator = (value: any) => void | string | Promise<void> | Promise<string>;

export type Options<T=any> = Partial<{
  defaultValues: T;
  validateOnSubmit: boolean;
  validateOnChange: boolean;
  validateOnBlur: boolean;
  revalidateOnChange: boolean;
  revalidateOnBlur: boolean;
}>;

export type Form<T=any> = {
  emitter: import('@for-fun/event-emitter').EventEmitter;
  values: Map<string, any>;
  errors: Map<string, string>;
  touched: Set<string>;
  validators: Map<string, () => void>;
  validating: Set<string>;
} & Options<T>;

export type PathValue = (string | number)[];
export type Name = string | PathValue;

export type Path = {
  value: PathValue;
  key: string;
}

export type TaskCounter = {
  emitter: import('@for-fun/event-emitter').EventEmitter;
  count: number;
};

export type FormProps<T=any> = {
  defaultValues?: T;
  form?: Form<T>;
  onSubmit?(values: T, e): void;
  onValidSubmit?(values: T, e): void;
  onInvalidSubmit?(values: T, e): void;
}
