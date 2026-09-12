import {on} from '../emitter';
import createPath from '../path';
import type {Name, Path} from '../path';
import type {Form, RegisterOptions, RegisterProps} from '../form';
import {
  changeValueByPath,
  registerFieldMode,
  unregisterFieldMode,
  userBlur
} from './change';
import {emitChangeByPath, getValueByPath, seedValueByPath} from './values';
import {registerValidatorByPath} from './validate';
import type {ValidatorRegistration} from './validate';
import {removeFieldForUnmount, restoreRemovedField} from './unmount';
import type {RemovedFieldSnapshot} from './unmount';
import {hasRuleConstraints, rulesToValidator} from '../rules';

/**
 * Create a non-hook field binding — react-hook-form's `register`
 * contract, wired onto this library's store: the bound element never
 * re-renders, every change still lands in the store through the gated
 * user-change pipeline, and `trigger`/submit/`getValues` read it like
 * any other field. `useField({uncontrolled: true})` already covers the
 * hook case; `register` exists for the call sites a hook cannot serve —
 * dynamic lists, conditional fields, non-React adapters — and for RHF
 * migration (`{...register('name')}` spreads unchanged).
 *
 * Lifecycle rides the returned `ref` callback, exactly like React's own
 * ref semantics guarantee attach/detach:
 * - **attach** (element handed over): restore a StrictMode-detached
 *   snapshot (React 19 detaches refs on the dev remount), seed the
 *   element's initial DOM content into the store when the path has no
 *   live value yet (an uncontrolled element's `defaultValue`/`checked`
 *   is invisible to React state, so the DOM is the source), register the
 *   field-mode entry (the "mounted field" signal routing `changeValue`
 *   into the gated pipeline), wire declarative `rules` through
 *   `registerValidatorByPath`, and subscribe the `'focusError'` channel
 *   (`setFocus`, failed-submit auto-focus) plus the bulk-reset DOM sync
 *   (payload-less `'change'` rewrites the element, register-style);
 * - **detach** (`null`): unregister mode entry and validator, drop the
 *   subscriptions, and tombstone the path unless
 *   `shouldUnregister: false` — the library's historical unmount
 *   default, snapshot/restore-safe under StrictMode.
 *
 * Event extraction defaults to the element's own protocol (files →
 * `target.files`, checkbox → `target.checked`, `valueAsNumber`/
 * `valueAsDate` under their flags, else `target.value`), overridable
 * with `eventToValue` — the same extraction `<Field>` performs.
 *
 * @param form
 * @param name path or segment array
 * @param options {@link RegisterOptions}
 * @return spreadable props {@link RegisterProps}
 */
export function registerField(
  form: Form,
  name: Name,
  options?: RegisterOptions
): RegisterProps {
  const path = createPath(name);
  const {
    mode,
    shouldUnregister,
    eventToValue,
    valueAsNumber,
    valueAsDate,
    rules
  } = options ?? {};

  const toValue =
    eventToValue ??
    ((e: any) => {
      const target = e?.target;
      if (!target) return e;
      if (target.type === 'file') return target.files;
      if (target.type === 'checkbox') return target.checked;
      if (valueAsNumber) return target.valueAsNumber;
      if (valueAsDate) return target.valueAsDate;
      return target.value;
    });

  // Per-element lifecycle state — the ref callback's attach/detach pair is
  // the mount/unmount signal, the same contract React guarantees for refs.
  let el: any = null;
  let modeToken: object | null = null;
  let disposeValidator: (() => void) | null = null;
  let snapshot: RemovedFieldSnapshot | null = null;
  let offFocus: (() => void) | null = null;
  let offBulkSync: (() => void) | null = null;

  const syncDom = () => {
    // File inputs cannot be assigned a value at all.
    if (!el || el.type === 'file') return;
    const next = getValueByPath(form, path);
    const asString = next == null ? '' : String(next);
    if (el.value !== asString) el.value = asString;
  };

  const attach = (node: any) => {
    // React 19's StrictMode detaches and re-attaches refs on the dev
    // remount; a tombstone snapshot taken by the detach right before is
    // restored here, so no render or subscriber observes the gap.
    if (snapshot) {
      restoreRemovedField(form, path, snapshot);
      snapshot = null;
    }
    el = node;
    // Seed the DOM's initial content (defaultValue / checked) into the
    // store: uncontrolled elements are invisible to React state, and
    // getValues/submit read the store. Never clobbers an existing value.
    if (node.type !== 'file' && getValueByPath(form, path) === undefined) {
      seedValueByPath(
        form,
        path,
        node.type === 'checkbox' ? node.checked : node.value
      );
      // The seed is an emit-free write (the announce split out for
      // render-phase callers); a ref callback runs post-commit, so the
      // announce can fire directly.
      emitChangeByPath(form, path);
    }
    modeToken = registerFieldMode(form, path, mode).token;
    if (rules && hasRuleConstraints(rules)) {
      // The required gate splits off like useField's: synchronous, runs on
      // every kick; the remaining rules compose into the debounced
      // validator (debounce fixed at 0 — immediate).
      const {required, ...rest} = rules;
      const requiredGate =
        required !== undefined ? rulesToValidator({required}) : undefined;
      disposeValidator = registerValidatorByPath(form, path, {
        validate: () =>
          hasRuleConstraints(rest) ? rulesToValidator(rest) : undefined,
        debounce: () => 0,
        sync: () => requiredGate
      } as ValidatorRegistration);
    }
    offFocus = on(
      form.emitter,
      'focusError',
      (key: string, options?: {shouldSelect?: boolean}) => {
        if (key !== path.key || !el || typeof el.focus !== 'function') return;
        el.focus();
        if (options?.shouldSelect && typeof el.select === 'function') {
          el.select();
        }
      }
    );
    // Bulk operations (reset, setInitialValues) emit payload-less and
    // rewrite the store without re-rendering this element — sync its DOM
    // directly, exactly how RHF's reset clears uncontrolled inputs.
    offBulkSync = on(form.emitter, 'change', (changed?: Path) => {
      if (changed) return;
      syncDom();
    });
  };

  const detach = () => {
    if (modeToken) {
      unregisterFieldMode(form, path, modeToken);
      modeToken = null;
    }
    if (disposeValidator) {
      disposeValidator();
      disposeValidator = null;
    }
    if (offFocus) {
      offFocus();
      offFocus = null;
    }
    if (offBulkSync) {
      offBulkSync();
      offBulkSync = null;
    }
    el = null;
    // The same effective unmount expression useField applies: the
    // binding's own option, then the form-level default, then the
    // library's historical default (tombstone).
    if ((shouldUnregister ?? form.shouldUnregister) !== false) {
      snapshot = removeFieldForUnmount(form, path);
    }
  };

  return {
    name: path.key,
    onChange: (e: any) => changeValueByPath(form, path, toValue(e)),
    onBlur: () => userBlur(form, path),
    ref: (node: any) => {
      if (node) attach(node);
      else detach();
    }
  };
}
