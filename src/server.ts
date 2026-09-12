/** Server-side validation entry — `react-f0rm/server`. A React-free entry
 * so Server Actions/RSC can validate a payload without pulling hooks into
 * the graph. {@link validateValues} is a plain function over values (the
 * `trigger` contract), composing into any framework handler; not
 * re-exported from the main entry so client bundles stay at baseline. */
import createForm, {getErrors, getValues, trigger} from './form';
import type {FieldErrorEntry, Options, ValidationOutcome} from './form';

// Re-export the brand symbol here (not the root) so schema adapters can
// build a ValidationOutcome without dragging the React graph in.
export {VALIDATION_OUTCOME} from './form';
export type {ValidationOutcome};

// Framework-free array ops (useFieldArray's headless counterparts) for
// server-side payload manipulation.
export {
  appendValue,
  prependValue,
  insertValue,
  removeValue,
  moveValue,
  swapValues,
  replaceValues,
  updateValue
} from './form';

/** The outcome of {@link validateValues}: `valid`, the (schema-coerced)
 * values, and the round's flat error entries. */
export type ValidateValuesResult<T extends Record<string, any> = any> = {
  /** Whether the round landed no errors. An invalid payload is data, not
   * a rejection — both branches are interesting server-side. */
  valid: boolean;
  /** The values after the round: parsed output when the validator
   * returned a branded outcome, the input otherwise. */
  values: T;
  /** Every error flattened to {path, type, message}; feed to
   * `setServerErrors` to land it back on the client form. */
  errors: FieldErrorEntry[];
};

/** Append one value under `key`: arrays/FileLists flatten per item, Files
 * keep their name, Dates become ISO strings, other objects JSON.stringify. */
function appendFormDataValue(fd: FormData, key: string, value: any): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) appendFormDataValue(fd, key, item);
    return;
  }
  if (typeof FileList !== 'undefined' && value instanceof FileList) {
    for (let i = 0; i < value.length; i++) fd.append(key, value.item(i)!);
    return;
  }
  if (typeof File !== 'undefined' && value instanceof File) {
    fd.append(key, value, value.name);
    return;
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    fd.append(key, value);
    return;
  }
  if (value instanceof Date) {
    fd.append(key, value.toISOString());
    return;
  }
  fd.append(
    key,
    typeof value === 'object' ? JSON.stringify(value) : String(value)
  );
}

/** Convert values into FormData (Server Actions/multipart shape). Arrays
 * become multiple entries per key; Files keep names; Dates → ISO; objects
 * JSON.stringify; null/undefined skipped. */
export function formDataFromValues(values: Record<string, any>): FormData {
  const fd = new FormData();
  for (const key of Object.keys(values)) {
    appendFormDataValue(fd, key, values[key]);
  }
  return fd;
}

/** Parse one FormData string: JSON-looking values (`{…}`, `[…]`) parse
 * back; everything else stays literal (quoted text is never parsed). */
function parseFormDataString(raw: string): unknown {
  const value = raw.trim();
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      // Typed text that merely looks like JSON — keep the literal input.
      return raw;
    }
  }
  return raw;
}

function readFormDataEntry(entry: FormDataEntryValue): unknown {
  if (typeof File !== 'undefined' && entry instanceof File) return entry;
  return parseFormDataString(entry as string);
}

/** Convert FormData back into a values object — the inverse of
 * {@link formDataFromValues}. Multiple entries under a key collect into
 * an array, JSON-looking strings parse back, Files pass through, and
 * missing keys are omitted. */
export function valuesFromFormData(formData: FormData): Record<string, any> {
  const values: Record<string, any> = {};
  // Iterate unique keys (FormData.keys() repeats per entry); getAll
  // collects every entry under one key in insertion order.
  for (const key of new Set(formData.keys())) {
    const entries = formData.getAll(key);
    values[key] =
      entries.length === 1
        ? readFormDataEntry(entries[0])
        : entries.map(readFormDataEntry);
  }
  return values;
}

/** Validate a payload server-side — no form instance, no React. Spins up
 * a throwaway form from `options` (initialValues forced to `values`),
 * runs one whole-form `trigger`, and reads the settled round back (a
 * single await drains async validators and debounce windows). Field
 * validators can't participate (nothing is mounted); pass a form-level
 * schema validator. A branded outcome's parsed values become the baseline
 * `getValues` layers over. Safe in Node, Server Actions and RSC. */
export async function validateValues<T extends Record<string, any> = any>(
  values: T,
  options?: Options<T>
): Promise<ValidateValuesResult<T>> {
  const form = createForm({...options, initialValues: values});
  const valid = await trigger(form);
  return {valid, values: getValues(form), errors: getErrors(form)};
}
