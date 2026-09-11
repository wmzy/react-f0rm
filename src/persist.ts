/** Local persistence — `react-f0rm/persist`. Ships separately (React-free,
 * imports only the headless core) so unused persistence never enters a
 * bundle. */
import {getValues, setInitialValues} from './form';
import type {Form} from './form';
import {subscribe} from './subscribe';

/** Storage surface {@link persistForm} needs; localStorage/sessionStorage
 * satisfy it, pass a custom object for tests/SSR. */
export type PersistStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Options for {@link persistForm}. */
export type PersistOptions = {
  /** Storage key the form snapshot lives under. */
  key: string;
  /** Where to read/write. Defaults to localStorage; without one persistence is a silent no-op. */
  storage?: PersistStorage;
  /** Transform values before serialization (e.g. strip File entries). Defaults to identity. */
  serialize?: (values: Record<string, any>) => Record<string, any>;
  /** Parse the stored string back. Defaults to JSON.parse; a throwing parse is swallowed. */
  deserialize?: (raw: string) => Record<string, any>;
};

/** Persist a form's values and hydrate them back next session. Call once
 * before interaction: hydration applies the snapshot via setInitialValues
 * (restored values become the baseline, so the form starts clean); every
 * 'change' re-writes it. Returns the unsubscribe (no-op without storage). */
export function persistForm(form: Form, options: PersistOptions): () => void {
  const {key} = options;
  const storage: PersistStorage | undefined =
    options.storage ??
    (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!storage) return () => {};

  // Hydrate before subscribing: the restored baseline must exist before
  // the first 'change' write, so the initial snapshot persisted equals
  // the snapshot the user sees.
  const raw = storage.getItem(key);
  if (raw !== null) {
    try {
      const parse = options.deserialize ?? ((s: string) => JSON.parse(s));
      setInitialValues(form, parse(raw));
    } catch {
      // Corrupted or foreign payload under our key: ignore it, start from
      // the form's own initialValues.
    }
  }

  return subscribe(form, {
    event: 'change',
    callback: () => {
      const values = options.serialize
        ? options.serialize(getValues(form))
        : getValues(form);
      try {
        storage.setItem(key, JSON.stringify(values));
      } catch {
        // Quota exceeded / storage disabled: persistence is best-effort.
      }
    }
  });
}
