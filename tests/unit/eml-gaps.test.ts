import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { computeCyclomatic, complexityOfNode } from '../../src/eml/engines/complexity.js';
import { GapsEngine, scoreGap, RISK_WEIGHTS } from '../../src/eml/engines/gaps.js';

describe('cyclomatic complexity', () => {
  it('returns 1 for straight-line code', () => {
    expect(computeCyclomatic('const a = 1;\nreturn a + 2;')).toBe(1);
  });

  it('counts branch points', () => {
    const src = `
      function f(x) {
        if (x > 0) { return 1; }
        for (let i = 0; i < x; i++) {
          if (i % 2 === 0 && i > 2) continue;
        }
        return x > 10 ? 'big' : 'small';
      }
    `;
    // if + for + (if + &&) + ternary => 1 + 5 = 6
    expect(computeCyclomatic(src)).toBe(6);
  });

  it('ignores keywords inside strings and comments', () => {
    const src = `const s = "if for while && ||"; // if for catch\nreturn s;`;
    expect(computeCyclomatic(src)).toBe(1);
  });

  it('slices a node line range', () => {
    const file = ['line0', 'if (a) {}', 'if (b) {}', 'plain'].join('\n');
    expect(complexityOfNode({ startLine: 2, endLine: 2 }, file)).toBe(2);
  });
});

describe('scoreGap', () => {
  it('weights are normalized and produce [0,1]', () => {
    const total = RISK_WEIGHTS.complexity + RISK_WEIGHTS.ownership + RISK_WEIGHTS.docs + RISK_WEIGHTS.churn;
    expect(total).toBeCloseTo(1);
    const worst = scoreGap({ complexity: 100, ownershipStrength: 0, missingDocs: true, churn: 100 });
    expect(worst).toBeCloseTo(1);
    const best = scoreGap({ complexity: 1, ownershipStrength: 1, missingDocs: false, churn: 0 });
    expect(best).toBeLessThan(0.05);
  });

  it('ranks weakly-owned undocumented complex code higher', () => {
    const risky = scoreGap({ complexity: 20, ownershipStrength: 0.1, missingDocs: true, churn: 15 });
    const safe = scoreGap({ complexity: 3, ownershipStrength: 0.9, missingDocs: false, churn: 1 });
    expect(risky).toBeGreaterThan(safe);
  });
});

const REPO = '0123456789abcdef';

describe('GapsEngine.findKnowledgeGaps', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let engine: GapsEngine;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-gap-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    const db = storage.getDatabase();
    // Inject a deterministic complexity provider keyed by ref.
    engine = new GapsEngine(db, {
      complexityOf: (ref) => (ref === 'hot.ts' ? 30 : 2),
    });
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function addPerson(id: string): void {
    storage
      .getDatabase()
      .prepare(`INSERT INTO people (id, display_name, emails, aliases) VALUES (?, ?, '[]', '[]')`)
      .run(id, id);
  }

  function addSignal(personId: string, ref: string, n: number): void {
    const stmt = storage
      .getDatabase()
      .prepare(
        `INSERT INTO ownership_signals (id, person_id, entity_type, entity_ref, signal, weight, last_activity_at)
         VALUES (?, ?, 'file', ?, 'commit', 1, '2026-01-01T00:00:00Z')`
      );
    for (let i = 0; i < n; i++) stmt.run(`${ref}-${i}-${Math.random()}`, personId, ref);
  }

  it('ranks the complex, high-churn, undocumented file first', () => {
    addPerson('alice');
    addSignal('alice', 'hot.ts', 15);
    addSignal('alice', 'cold.ts', 1);

    const gaps = engine.findKnowledgeGaps(REPO, { limit: 10 });
    expect(gaps.length).toBe(2);
    expect(gaps[0].entityRef).toBe('hot.ts');
    expect(gaps[0].riskScore).toBeGreaterThan(gaps[1].riskScore);
    expect(gaps[0].reasons).toContain('high complexity');
  });

  it('lowers risk when documentation exists', () => {
    addPerson('bob');
    addSignal('bob', 'hot.ts', 15);
    const before = engine.findKnowledgeGaps(REPO)[0].riskScore;

    const db = storage.getDatabase();
    db.prepare(
      `INSERT INTO memory_objects (id, kind, title, summary, body, repository_id, valid_from)
       VALUES ('m1', 'decision', 't', '', '', ?, '2026-01-01T00:00:00Z')`
    ).run(REPO);
    db.prepare(
      `INSERT INTO entity_links (memory_id, target_kind, target_ref) VALUES ('m1', 'file', 'hot.ts')`
    ).run();

    const after = engine.findKnowledgeGaps(REPO)[0].riskScore;
    expect(after).toBeLessThan(before);
  });
});
