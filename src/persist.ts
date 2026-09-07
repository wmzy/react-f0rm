/**
 * Local persistence — `react-f0rm/persist`.
 *
 * Ships separately from the main entry (like the resolvers and devtools)
 * so persistence code never lands in bundles that do not use it, and
 * imports nothing but the headless core: the module is React-free and
 * works with any form instance, hook-created or not.
 */
import {getValues, setInitialValues} from './form';
import type {Form} from './form';
import {subscribe} from './subscribe';

/** Storage surface {@link persistForm} needs — the browser's
 * `localStorage`/`sessionStorage` satisfy it as-is; pass a custom object
 * (or a framework adapter) for tests, SSR or non-DOM runtimes. */
export type PersistStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Options for {@link persistForm}. */
export type PersistOptions = {
  /** Storage key the form snapshot lives under. */
  key: string;
  /** Where to read/write. Defaults to `window.localStorage` when it
   * exists; without one (SSR, Node) persistence becomes a silent no-op
   * and the returned unsubscribe is a no-op too. */
  storage?: PersistStorage;
  /** Transform values before serialization — e.g. strip File/FileList
   * entries (JSON.stringify drops their contents anyway) or pick a
   * subset. Defaults to identity. */
  serialize?: (values: Record<string, any>) => Record<string, any>;
  /** Parse the stored string back into values. Defaults to JSON.parse;
   * a throwing parse (corrupted/foreign payload) is swallowed and the
   * stored snapshot ignored. */
  deserialize?: (raw: string) => Record<string, any>;
};

/**
 * Persist a form's values to a storage backend (localStorage by default)
 * and hydrate them back on the next session.
 *
 * Call once at form creation, before user interaction: hydration applies
 * the stored snapshot through {@link setInitialValues} — the restored
 * values become the baseline, so the form starts clean, not dirty. Every
 * 'change' event re-writes the snapshot (a keystroke writes the whole
 * values tree, JSON-stringified; browsers handle that fine for typical
 * form sizes, and `serialize` can shrink it).
 *
 * Returns the unsubscribe function — call it to stop persisting (the
 * stored snapshot stays).
 *
 * @param form form instance to persist
 * @param options storage key, backend and (de)serialization hooks
 * @return unsubscribe function (no-op when no storage exists)
 */
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
