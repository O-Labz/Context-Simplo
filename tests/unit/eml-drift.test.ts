import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { EventStore } from '../../src/eml/events/store.js';
import { DriftEngine, validateSpec, ArchitectureRuleSchema } from '../../src/eml/engines/drift.js';
import { ArchitectureRuleValidationError } from '../../src/core/errors.js';

const REPO = '0123456789abcdef';

describe('EML Drift engine', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let store: EventStore;
  let engine: DriftEngine;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-drift-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    const db = storage.getDatabase();
    store = new EventStore(db);
    engine = new DriftEngine(db, { eventStore: store });
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function addNode(id: string, ref: string, label = 'file'): void {
    storage
      .getDatabase()
      .prepare(
        `INSERT INTO graph_nodes (id, label, ref, repository_id, props_json) VALUES (?, ?, ?, ?, '{}')`
      )
      .run(id, label, ref, REPO);
  }

  function addEdge(id: string, src: string, dst: string, label = 'depends_on'): void {
    storage
      .getDatabase()
      .prepare(
        `INSERT INTO graph_edges (id, src, dst, label, repository_id, weight, confidence, valid_from)
         VALUES (?, ?, ?, ?, ?, 1, 1, '2026-01-01T00:00:00Z')`
      )
      .run(id, src, dst, label, REPO);
  }

  it('rejects an invalid rule spec with a 400 error', () => {
    expect(() => validateSpec('forbidden_dep', { from: 'a' })).toThrow(ArchitectureRuleValidationError);
    expect(() => engine.addRule({ repositoryId: REPO, ruleType: 'layer', spec: { layers: [] }, source: 'declared' })).toThrow(
      ArchitectureRuleValidationError
    );
  });

  it('validates repositoryId format', () => {
    const r = ArchitectureRuleSchema.safeParse({ repositoryId: 'bad', ruleType: 'naming', spec: { pattern: '.*' } });
    expect(r.success).toBe(false);
  });

  it('detects forbidden dependencies', () => {
    addNode('n1', 'src/api/handler.ts');
    addNode('n2', 'src/db/client.ts');
    addEdge('e1', 'n1', 'n2');
    engine.addRule({ repositoryId: REPO, ruleType: 'forbidden_dep', spec: { from: 'src/api/', to: 'src/db/' }, source: 'declared' });

    const violations = engine.detectDrift(REPO);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleType).toBe('forbidden_dep');
    expect(violations[0].fromRef).toBe('src/api/handler.ts');
    expect(violations[0].explanation).toContain('Forbidden dependency');

    // an event is emitted
    const count = storage
      .getDatabase()
      .prepare(`SELECT COUNT(*) AS c FROM eml_events WHERE type = 'drift.violation_detected'`)
      .get() as { c: number };
    expect(count.c).toBeGreaterThanOrEqual(1);
  });

  it('detects upward layer violations but allows downward deps', () => {
    addNode('a', 'src/api/x.ts');
    addNode('b', 'src/domain/y.ts');
    addNode('c', 'src/db/z.ts');
    // api -> db (downward, allowed)
    addEdge('e1', 'a', 'c');
    // db -> api (upward, violation)
    addEdge('e2', 'c', 'a');
    engine.addRule({
      repositoryId: REPO,
      ruleType: 'layer',
      spec: { layers: [{ name: 'api', match: 'src/api/' }, { name: 'domain', match: 'src/domain/' }, { name: 'db', match: 'src/db/' }] },
      source: 'declared',
    });

    const violations = engine.detectDrift(REPO);
    expect(violations).toHaveLength(1);
    expect(violations[0].fromRef).toBe('src/db/z.ts');
    expect(violations[0].toRef).toBe('src/api/x.ts');
  });

  it('detects naming violations', () => {
    addNode('n1', 'src/components/Button.tsx', 'symbol');
    addNode('n2', 'src/components/widget.tsx', 'symbol');
    engine.addRule({
      repositoryId: REPO,
      ruleType: 'naming',
      spec: { label: 'symbol', pattern: '[A-Z][a-zA-Z]+\\.tsx$' },
      source: 'declared',
    });

    const violations = engine.detectDrift(REPO);
    expect(violations.map((v) => v.fromRef)).toContain('src/components/widget.tsx');
    expect(violations.map((v) => v.fromRef)).not.toContain('src/components/Button.tsx');
  });

  it('returns no violations when there are no rules', () => {
    addNode('n1', 'a.ts');
    expect(engine.detectDrift(REPO)).toEqual([]);
  });
});
