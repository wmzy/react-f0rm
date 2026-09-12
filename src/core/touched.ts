import {emit} from '../emitter';
import createPath, {segmentsFromKey} from '../path';
import type {Name, Path} from '../path';
import type {AnyPath} from '../types';
import type {Form} from '../form';

/** Set a field's touched state. */
export function setTouched(form: Form, name: Name): void {
  setTouchedByPath(form, createPath(name));
}

/** Set a field's touched state by path. */
export function setTouchedByPath({emitter, touched}: Form, path: Path): void {
  if (touched.has(path.key)) return;
  touched.add(path.key);
  // Path payload lets key-scoped subscribers skip unrelated fields;
  // payload-less listeners ignore it.
  emit(emitter, 'touched', path);
}

/** Check if a field has been touched. */
export function hasTouched<
  T extends Record<string, any> = any,
  P extends AnyPath<T> = AnyPath<T>
>(form: Form<T>, name: P): boolean {
  return hasTouchedByPath(form, createPath(name));
}

/** Check if a field has been touched by path. */
export function hasTouchedByPath({touched}: Form, path: Path): boolean {
  return touched.has(path.key);
}

/** Get touched fields as user-facing dotted paths ('a.b', 'a.0.c'). */
export function getTouchedFields({touched}: Form): string[] {
  return Array.from(touched, key => segmentsFromKey(key).join('.'));
}

/** Is touched — any field has been touched. */
export function isTouched({touched}: Form): boolean {
  return touched.size > 0;
}
