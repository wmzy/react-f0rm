export type Form<T=any> = {
  emitter: import('@for-fun/event-emitter').EventEmitter;
  validatingCount: number;
  defaultValues?: T;
  values: Map<string, any>;
  errors: Map<string, string>;
  touched: Set<string>;
  validating: Set<string>;
}

export type Paths = (string | number)[];

export type TaskCounter = {
  emitter: import('@for-fun/event-emitter').EventEmitter;
  count: number;
};

export type FormProps<T=any> = {
  form?: Form<T>;
  onSubmit?(values: T, e): void;
  onValidSubmit?(values: T, e): void;
  onInvalidSubmit?(values: T, e): void;
}
