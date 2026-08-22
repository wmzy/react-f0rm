import * as React from 'react';
import {useState} from 'react';
import type {ReactNode} from 'react';

/** Nodes deeper than this start collapsed. */
const DEFAULT_OPEN_DEPTH = 1;

/**
 * Read-only inspection: the tree never mutates form state, so structural
 * sharing of the inspected value is safe and re-renders stay cheap.
 */
interface JsonNodeProps {
  /** Property name (or array index) rendering before the value. */
  name?: string | number;
  /** Value to render. */
  value: unknown;
  /** Current nesting depth (root is 0). */
  depth?: number;
}

/**
 * One line of the tree: either a collapsible container row
 * (`▸ key: {`) or a leaf (`key: value`).
 */
function JsonNode({name, value, depth = 0}: JsonNodeProps) {
  const [open, setOpen] = useState(depth <= DEFAULT_OPEN_DEPTH);

  const label =
    name === undefined ? null : (
      <>
        <span className="rf0-dt-key">{String(name)}</span>
        <span className="rf0-dt-punct">: </span>
      </>
    );

  if (value !== null && typeof value === 'object') {
    const isArray = Array.isArray(value);
    const entries: Array<[string | number, unknown]> = isArray
      ? (value as unknown[]).map((v, i) => [i, v])
      : Object.entries(value as Record<string, unknown>);
    const openBracket = isArray ? '[' : '{';
    const closeBracket = isArray ? ']' : '}';
    const summary = open
      ? ''
      : `${openBracket}…${closeBracket} ${entries.length}`;

    return (
      <div className="rf0-dt-row" style={{paddingLeft: depth * 12}}>
        <button
          type="button"
          className="rf0-dt-node-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="rf0-dt-caret">{open ? '▾' : '▸'}</span>
          {label}
          <span className="rf0-dt-punct">{open ? openBracket : summary}</span>
        </button>
        {open && (
          <>
            {entries.map(([k, v]) => (
              <JsonNode key={String(k)} name={k} value={v} depth={depth + 1} />
            ))}
            <span className="rf0-dt-punct" style={{paddingLeft: depth * 12}}>
              {closeBracket}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <span
      className="rf0-dt-row"
      style={{paddingLeft: depth * 12, display: 'block'}}
    >
      {label}
      <Primitive value={value} />
    </span>
  );
}

/** Render a primitive leaf with terminal-style type coloring. */
function Primitive({value}: {value: unknown}): ReactNode {
  if (value === undefined)
    return <span className="rf0-dt-null">undefined</span>;
  if (value === null) return <span className="rf0-dt-null">null</span>;
  if (typeof value === 'string')
    return <span className="rf0-dt-string">&quot;{value}&quot;</span>;
  if (typeof value === 'boolean')
    return <span className="rf0-dt-boolean">{String(value)}</span>;
  return <span className="rf0-dt-number">{String(value)}</span>;
}

export default JsonNode;
