/**
 * Stylesheet for the Devtools panel.
 *
 * Zero runtime dependencies by design: a single CSS string injected once
 * into <head> (idempotent across module reloads and multiple bundles).
 *
 * Aesthetic: instrument panel / terminal — near-black layers, monospace
 * stack, dense rows, hairline borders. Semantic colors only: error red,
 * success green, neutral gray, with one dim amber accent for the active
 * tab indicator and the collapsed badge.
 */

const CSS = `
.rf0-dt {
  position: fixed;
  z-index: 2147483000;
  box-sizing: border-box;
  width: 308px;
  max-width: calc(100vw - 16px);
  max-height: min(70vh, 560px);
  display: flex;
  flex-direction: column;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', 'JetBrains Mono',
    Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 11px;
  line-height: 1.45;
  color: #c7d0dc;
  background: #0c1017;
  border: 1px solid #1f2735;
  border-radius: 4px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.4);
}
.rf0-dt *,
.rf0-dt-badge * {
  box-sizing: border-box;
}
.rf0-dt--top-right { top: 8px; right: 8px; }
.rf0-dt--bottom-right { bottom: 8px; right: 8px; }
.rf0-dt--top-left { top: 8px; left: 8px; }
.rf0-dt--bottom-left { bottom: 8px; left: 8px; }

/* ---- header -------------------------------------------------------- */
.rf0-dt-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px 5px 9px;
  border-bottom: 1px solid #1f2735;
  background: #10151e;
}
.rf0-dt-title {
  flex: 1;
  min-width: 0;
  color: #8b96a5;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rf0-dt-title::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 50%;
  background: #e2b93b;
  vertical-align: 1px;
}
.rf0-dt-headerbtn {
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 1px 5px;
  color: #8b96a5;
  background: transparent;
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.rf0-dt-headerbtn:hover { color: #dce3ec; border-color: #2a3547; }
.rf0-dt-headerbtn:focus-visible,
.rf0-dt-tab:focus-visible,
.rf0-dt-action:focus-visible,
.rf0-dt-badge:focus-visible,
.rf0-dt-node-toggle:focus-visible {
  outline: 1px solid #e2b93b;
  outline-offset: 1px;
}

/* ---- tabs ---------------------------------------------------------- */
.rf0-dt-tablist {
  display: flex;
  border-bottom: 1px solid #1f2735;
  background: #0e131b;
}
.rf0-dt-tab {
  flex: 1;
  padding: 4px 2px 5px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #6b7686;
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
}
.rf0-dt-tab:hover { color: #aab5c4; }
.rf0-dt-tab[aria-selected='true'] {
  color: #e7edf4;
  border-bottom-color: #e2b93b;
}
.rf0-dt-tab-count {
  margin-left: 3px;
  color: inherit;
  opacity: 0.75;
}
.rf0-dt-tab--danger[aria-selected='true'] {
  border-bottom-color: #f0647c;
}

/* ---- panels -------------------------------------------------------- */
.rf0-dt-panel {
  flex: 1;
  min-height: 84px;
  overflow: auto;
  padding: 6px 8px;
  scrollbar-width: thin;
  scrollbar-color: #2a3547 transparent;
}
.rf0-dt-empty {
  padding: 10px 2px;
  color: #4d5766;
  font-style: italic;
}

/* json tree */
.rf0-dt-row {
  display: block;
  white-space: pre;
  tab-size: 2;
}
.rf0-dt-node-toggle {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  white-space: pre;
}
.rf0-dt-node-toggle:hover .rf0-dt-key { color: #dce3ec; }
.rf0-dt-caret {
  display: inline-block;
  width: 1.2em;
  color: #4d5766;
}
.rf0-dt-key { color: #8b96a5; }
.rf0-dt-punct { color: #4d5766; }
.rf0-dt-string { color: #8fd68a; }
.rf0-dt-number { color: #e2b93b; }
.rf0-dt-boolean { color: #6fb3d9; }
.rf0-dt-null { color: #55607080; font-style: italic; }

/* errors / touched / dirty lists */
.rf0-dt-item {
  padding: 3px 2px;
  border-bottom: 1px dotted #1a2230;
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.rf0-dt-item:last-child { border-bottom: 0; }
.rf0-dt-item-path {
  color: #aab5c4;
  word-break: break-all;
}
.rf0-dt-item-msg {
  color: #f0647c;
  word-break: break-word;
}
.rf0-dt-item-msg--ok { color: #8fd68a; }
.rf0-dt-item-tag {
  flex: none;
  color: #4d5766;
  font-size: 10px;
}
.rf0-dt-item--touched .rf0-dt-item-path { color: #6fb3d9; }
.rf0-dt-item--dirty .rf0-dt-item-path { color: #e2b93b; }

/* ---- submit status + actions --------------------------------------- */
.rf0-dt-status {
  display: flex;
  gap: 10px;
  padding: 4px 9px;
  border-top: 1px solid #1f2735;
  background: #10151e;
  color: #6b7686;
  font-size: 10px;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
}
.rf0-dt-status b { color: #aab5c4; font-weight: 400; }
.rf0-dt-status .rf0-dt-on { color: #e2b93b; }
.rf0-dt-status .rf0-dt-ok { color: #8fd68a; }
.rf0-dt-status .rf0-dt-err { color: #f0647c; }
.rf0-dt-actions {
  display: flex;
  gap: 6px;
  padding: 6px 8px;
  border-top: 1px solid #1f2735;
  background: #10151e;
}
.rf0-dt-action {
  flex: 1;
  padding: 3px 0;
  border: 1px solid #2a3547;
  border-radius: 3px;
  background: #151b26;
  color: #c7d0dc;
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
}
.rf0-dt-action:hover { border-color: #3b4a61; background: #1a2230; color: #e7edf4; }
.rf0-dt-action:active { transform: translateY(1px); }

/* ---- collapsed badge ----------------------------------------------- */
.rf0-dt-badge {
  position: fixed;
  z-index: 2147483000;
  width: 26px;
  height: 26px;
  border: 1px solid #2a3547;
  border-radius: 50%;
  background: #0c1017;
  color: #e2b93b;
  font: inherit;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', 'JetBrains Mono',
    Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
}
.rf0-dt-badge:hover { border-color: #e2b93b; }
.rf0-dt-badge--top-right { top: 10px; right: 10px; }
.rf0-dt-badge--bottom-right { bottom: 10px; right: 10px; }
.rf0-dt-badge--top-left { top: 10px; left: 10px; }
.rf0-dt-badge--bottom-left { bottom: 10px; left: 10px; }
.rf0-dt-badge .rf0-dt-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #f0647c;
  display: none;
}
.rf0-dt-badge--has-errors .rf0-dt-dot { display: block; }
`;

const STYLE_ID = 'react-f0rm-devtools-style';

/**
 * Inject the panel stylesheet into <head>. Idempotent: repeated calls
 * (module reloads, HMR, multiple Devtools mounts) never duplicate the
 * <style> element. No-ops outside a DOM environment (SSR).
 */
export function injectDevtoolsStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

injectDevtoolsStyles();
