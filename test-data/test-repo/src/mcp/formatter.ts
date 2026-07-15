/**
 * MCP Response Formatter
 *
 * Compact mode reduces token usage ~60% by:
 * - Shortening verbose JSON keys (filePath → fp, qualifiedName → qn, etc.)
 * - Removing null/undefined values
 * - Dropping rarely-useful fields (id hashes, visibility, pagination echoes)
 * - Hoisting shared repositoryId/language to envelope level
 * - Minifying JSON (no indentation)
 *
 * Full mode: passthrough with pretty-print (existing behavior).
 */

import type { ResponseMode } from '../core/types.js';

const KEY_MAP: Record<string, string> = {
  results: 'r',
  callers: 'r',
  callees: 'r',
  name: 'n',
  qualifiedName: 'qn',
  kind: 'k',
  filePath: 'fp',
  lineStart: 'ls',
  lineEnd: 'le',
  repositoryId: 'rid',
  language: 'lang',
  nodeId: 'nid',
  score: 's',
  isExported: 'x',
  complexity: 'cx',
  total: 't',
  hasMore: 'm',
  symbol: 'sym',
  affectedNodes: 'nodes',
  affectedFiles: 'files',
  entryPoints: 'entry',
  modules: 'mods',
  keyAbstractions: 'abs',
  searchType: 'st',
};

// Fields stripped entirely in compact mode
const STRIP_FIELDS = new Set(['id', 'visibility', 'limit', 'offset', 'columnStart', 'columnEnd']);

/**
 * Recursively rename keys, strip null/undefined/stripped fields.
 */
function compactValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map(compactValue).filter((v) => v !== undefined);
  }
  if (typeof value === 'object') {
    return compactObject(value as Record<string, unknown>);
  }
  return value;
}

function compactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (STRIP_FIELDS.has(key)) continue;
    if (val === null || val === undefined) continue;

    const compacted = compactValue(val);
    if (compacted === undefined) continue;

    const mappedKey = KEY_MAP[key] ?? key;
    out[mappedKey] = compacted;
  }
  return out;
}

/**
 * Hoist repositoryId and language to envelope when all items in a results
 * array share the same value, then remove from individual items.
 */
function hoistSharedFields(obj: Record<string, unknown>): Record<string, unknown> {
  const resultsKey = Object.keys(obj).find((k) => Array.isArray(obj[k]) && k === 'r');
  if (!resultsKey) return obj;

  const items = obj[resultsKey] as Record<string, unknown>[];
  if (items.length === 0) return obj;

  const sharedFields: Array<{ original: string; compact: string }> = [
    { original: 'repositoryId', compact: 'rid' },
    { original: 'language', compact: 'lang' },
  ];

  const hoisted: Record<string, unknown> = {};

  for (const { original, compact } of sharedFields) {
    const compactKey = KEY_MAP[original] ?? original;
    const values = items.map((item) => item[compactKey] ?? item[original]);
    const allSame = values.length > 0 && values.every((v) => v === values[0]);
    if (allSame && values[0] !== undefined) {
      hoisted[compact] = values[0];
    }
  }

  if (Object.keys(hoisted).length === 0) return obj;

  // Remove hoisted fields from each item
  const hoistedKeys = new Set(Object.keys(hoisted));
  const strippedItems = items.map((item) => {
    const copy = { ...item };
    for (const k of hoistedKeys) {
      delete copy[k];
    }
    return copy;
  });

  return { ...obj, ...hoisted, [resultsKey]: strippedItems };
}

/**
 * Transform a response object into compact form.
 */
export function compactResponse(result: unknown): unknown {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    return result;
  }
  const compacted = compactObject(result as Record<string, unknown>);
  return hoistSharedFields(compacted);
}

/**
 * Serialize an MCP tool result to string.
 * compact: short keys + minified JSON
 * full: original keys + pretty-printed JSON
 */
export function formatMCPResponse(result: unknown, mode: ResponseMode): string {
  if (mode === 'compact') {
    return JSON.stringify(compactResponse(result));
  }
  return JSON.stringify(result, null, 2);
}
