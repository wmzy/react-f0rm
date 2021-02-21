export type Store = {
  emitter: import('@for-fun/event-emitter').EventEmitter;
  validatingCount: number;
  defaultValues?: any;
  values: Map<string, any>;
  errors: Map<string, string>;
  touched: Set<string>;
}

export type Paths = (string | number)[];

export type TaskCounter = {
  emitter: import('@for-fun/event-emitter').EventEmitter;
  count: number;
};
