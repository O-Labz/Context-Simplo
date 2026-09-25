/**
 * MCP Response Formatter
 */

import { encode as encodeToon } from '@toon-format/toon';
import { ToonEncodeError } from '../core/errors.js';
import type { ResponseMode } from '../core/types.js';

const KEY_MAP: Record<string, string> = {
  results: 'r',
  callers: 'r',
  callees: 'r',
  repositories: 'repos',
  name: 'n',
  qualifiedName: 'qn',
  kind: 'k',
  filePath: 'fp',
  lineStart: 'ls',
  lineEnd: 'le',
  repositoryId: 'rid',
  language: 'lang',
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
  repoRoot: 'root',
  fileCount: 'fc',
  nodeCount: 'nc',
  edgeCount: 'ec',
  isWatched: 'w',
  lastIndexedAt: 'idx',
  totalAffectedNodes: 'tn',
  totalAffectedFiles: 'tf',
};

const STRIP_FIELDS = new Set([
  'id',
  'nodeId',
  'visibility',
  'limit',
  'offset',
  'columnStart',
  'columnEnd',
  'docstring',
  'parentSymbol',
  'packageStructure',
]);

const ROUNDED_NUMBER_KEYS = new Set(['score', 'confidence', 's']);

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function compactValue(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' && key && ROUNDED_NUMBER_KEYS.has(key)) {
    return roundMetric(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => compactValue(v)).filter((v) => v !== undefined);
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

    let processed: unknown = val;
    if (typeof val === 'number' && ROUNDED_NUMBER_KEYS.has(key)) {
      processed = roundMetric(val);
    }

    const compacted = compactValue(processed, key);
    if (compacted === undefined) continue;

    const mappedKey = KEY_MAP[key] ?? key;
    out[mappedKey] = compacted;
  }

  if (typeof out.n === 'string' && typeof out.qn === 'string' && out.n === out.qn) {
    delete out.qn;
  }

  return out;
}

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

  const hoistedKeys = new Set(Object.keys(hoisted));
  const strippedItems = items.map((item) => {
    const copy = { ...item };
    for (const k of hoistedKeys) {
      delete copy[k];
    }
    if (typeof copy.n === 'string' && typeof copy.qn === 'string' && copy.n === copy.qn) {
      delete copy.qn;
    }
    return copy;
  });

  return { ...obj, ...hoisted, [resultsKey]: strippedItems };
}

export function compactResponse(result: unknown): unknown {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    return result;
  }
  const compacted = compactObject(result as Record<string, unknown>);
  return hoistSharedFields(compacted);
}

function assertJsonData(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ToonEncodeError(new Error('non-finite number'));
    }
    return;
  }
  if (typeof value !== 'object') {
    throw new ToonEncodeError(new Error(`unsupported value type ${typeof value}`));
  }
  if (seen.has(value)) {
    throw new ToonEncodeError(new Error('circular value'));
  }
  seen.add(value);
  const entries = Array.isArray(value) ? value : Object.values(value);
  for (const entry of entries) {
    if (entry === undefined) {
      continue;
    }
    assertJsonData(entry, seen);
  }
}

export function formatMCPResponse(result: unknown, mode: ResponseMode): string {
  if (mode === 'full') {
    return JSON.stringify(result, null, 2);
  }
  const compacted = compactResponse(result);
  if (mode === 'toon') {
    assertJsonData(compacted, new WeakSet());
    try {
      return encodeToon(compacted);
    } catch (error) {
      throw new ToonEncodeError(error instanceof Error ? error : new Error(String(error)));
    }
  }
  return JSON.stringify(compacted);
}
