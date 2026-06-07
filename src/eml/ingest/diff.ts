/**
 * Diff observer.
 *
 * Computes a textual + structural delta between two git revisions and emits a
 * `code.diff.observed` event. The structural delta (added/removed/changed
 * symbols, dependency changes, deleted files) is derived from the unified diff
 * hunks so it is deterministic and offline-testable.
 *
 * SECURITY: revisions are validated against a strict allowlist before reaching
 * git. We never forward caller-controlled option flags (`--config`, `ext::`,
 * leading `-`) — that would be an RCE vector via simple-git.
 */

import { EventValidationError } from '../../core/errors.js';
import type { EventStore } from '../events/store.js';
import type { SymbolRef, StructuralDelta } from '../extract/candidate.js';

export const MAX_DIFF_BYTES = 1_000_000; // 1MB
export const MAX_DIFF_FILES = 1_000;

/** Minimal git surface needed by the observer (injectable for tests). */
export interface GitDiffRunner {
  raw(args: string[]): Promise<string>;
}

const SAFE_REV = /^[A-Za-z0-9_./~^@-]{1,200}$/;

/**
 * Validate a git revision string. Rejects option injection and transport
 * tricks. Throws on anything outside the allowlist.
 */
export function assertSafeRev(rev: string): void {
  if (typeof rev !== 'string' || rev.length === 0) {
    throw new EventValidationError('revision must be a non-empty string');
  }
  if (rev.startsWith('-')) {
    throw new EventValidationError(`unsafe revision (leading dash / option injection): ${rev}`);
  }
  if (/ext::|file::|\s|[;|&$`<>]/.test(rev)) {
    throw new EventValidationError(`unsafe revision (transport/shell metacharacters): ${rev}`);
  }
  if (!SAFE_REV.test(rev)) {
    throw new EventValidationError(`revision contains illegal characters: ${rev}`);
  }
}

interface NameStatusEntry {
  status: string;
  path: string;
  oldPath?: string;
}

function parseNameStatus(raw: string): NameStatusEntry[] {
  const out: NameStatusEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0];
    if (!status) continue;
    if (status.startsWith('R') && parts[1] && parts[2]) {
      out.push({ status: 'R', oldPath: parts[1], path: parts[2] });
    } else if (parts[1]) {
      out.push({ status: status[0] ?? status, path: parts[1] });
    }
  }
  return out;
}

const DECL_PATTERNS: Array<{ re: RegExp; kind: SymbolRef['kind'] }> = [
  { re: /export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/, kind: 'function' },
  { re: /export\s+(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/, kind: 'class' },
  { re: /export\s+interface\s+([A-Za-z0-9_$]+)/, kind: 'interface' },
  { re: /export\s+type\s+([A-Za-z0-9_$]+)/, kind: 'type' },
  { re: /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/, kind: 'variable' },
];

function declFromLine(line: string): SymbolRef | null {
  for (const { re, kind } of DECL_PATTERNS) {
    const m = line.match(re);
    if (m && m[1]) return { name: m[1], kind };
  }
  return null;
}

function symbolKey(s: SymbolRef): string {
  return `${s.kind}:${s.name}`;
}

/**
 * Parse a unified diff into a structural delta. Added/removed declarations are
 * matched on `+`/`-` hunk lines; a symbol present on both sides is "changed".
 */
export function computeStructuralDelta(diffText: string, commitMessage?: string): StructuralDelta {
  const added = new Map<string, SymbolRef>();
  const removed = new Map<string, SymbolRef>();
  let linesChanged = 0;

  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('+++') || raw.startsWith('---')) continue;
    if (raw.startsWith('+')) {
      linesChanged++;
      const sym = declFromLine(raw.slice(1));
      if (sym) added.set(symbolKey(sym), sym);
    } else if (raw.startsWith('-')) {
      linesChanged++;
      const sym = declFromLine(raw.slice(1));
      if (sym) removed.set(symbolKey(sym), sym);
    }
  }

  const addedSymbols: SymbolRef[] = [];
  const removedSymbols: SymbolRef[] = [];
  const changedSymbols: SymbolRef[] = [];
  for (const [key, sym] of added) {
    if (removed.has(key)) changedSymbols.push(sym);
    else addedSymbols.push(sym);
  }
  for (const [key, sym] of removed) {
    if (!added.has(key)) removedSymbols.push(sym);
  }

  const { addedDependencies, removedDependencies } = parseDependencyDelta(diffText);

  return {
    addedSymbols,
    removedSymbols,
    changedSymbols,
    addedDependencies,
    removedDependencies,
    linesChanged,
    message: commitMessage,
  };
}

/** Parse package.json dependency additions/removals from the diff. */
export function parseDependencyDelta(diffText: string): {
  addedDependencies: string[];
  removedDependencies: string[];
} {
  const added: string[] = [];
  const removed: string[] = [];
  let inPackageJson = false;
  const depLine = /^[+-]\s*"([^"]+)"\s*:\s*"[^"]*"\s*,?\s*$/;

  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('diff --git')) {
      inPackageJson = /package\.json/.test(raw);
      continue;
    }
    if (!inPackageJson) continue;
    const m = raw.match(depLine);
    if (!m || !m[1]) continue;
    if (raw.startsWith('+')) added.push(m[1]);
    else if (raw.startsWith('-')) removed.push(m[1]);
  }
  return { addedDependencies: added, removedDependencies: removed };
}

export interface DiffObserveResult {
  eventId: string | null;
  delta: StructuralDelta;
  deletedFiles: string[];
  addedFiles: string[];
  truncated: boolean;
  fileCount: number;
}

export class DiffObserver {
  private readonly eventStore: EventStore;

  constructor(eventStore: EventStore) {
    this.eventStore = eventStore;
  }

  /**
   * Observe the delta between two revisions and emit `code.diff.observed`.
   */
  async observe(
    runner: GitDiffRunner,
    repositoryId: string,
    fromRev: string,
    toRev: string,
    opts: { commitMessage?: string; sourceRef?: string } = {}
  ): Promise<DiffObserveResult> {
    assertSafeRev(fromRev);
    assertSafeRev(toRev);

    const nameStatusRaw = await runner.raw(['diff', '--name-status', fromRev, toRev]);
    const entries = parseNameStatus(nameStatusRaw);
    const truncated = entries.length > MAX_DIFF_FILES;
    const limited = truncated ? entries.slice(0, MAX_DIFF_FILES) : entries;

    const deletedFiles = limited.filter((e) => e.status === 'D').map((e) => e.path);
    const addedFiles = limited.filter((e) => e.status === 'A').map((e) => e.path);

    let diffText = await runner.raw(['diff', '--unified=3', fromRev, toRev]);
    if (diffText.length > MAX_DIFF_BYTES) {
      diffText = diffText.slice(0, MAX_DIFF_BYTES);
    }

    const delta = computeStructuralDelta(diffText, opts.commitMessage);
    delta.deletedFiles = deletedFiles;
    delta.addedFiles = addedFiles;

    const { id } = this.eventStore.append({
      type: 'code.diff.observed',
      source: 'diff_observer',
      sourceRef: opts.sourceRef ?? `${fromRev}..${toRev}`,
      repositoryId,
      payload: {
        from: fromRev,
        to: toRev,
        delta,
        fileCount: limited.length,
        truncated,
      },
    });

    return {
      eventId: id,
      delta,
      deletedFiles,
      addedFiles,
      truncated,
      fileCount: limited.length,
    };
  }
}

/** Build a simple-git backed runner for a repository path. */
export async function createSimpleGitRunner(repoPath: string): Promise<GitDiffRunner> {
  const { simpleGit } = await import('simple-git');
  const git = simpleGit({ baseDir: repoPath });
  return {
    raw: (args: string[]) => git.raw(args),
  };
}
