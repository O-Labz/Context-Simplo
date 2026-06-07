import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { OwnershipEngine } from '../../src/eml/engines/ownership.js';
import { DriftEngine } from '../../src/eml/engines/drift.js';
import { SqliteGraphStore } from '../../src/eml/store/sqlite-graph.js';
import { ImpactSimEngine } from '../../src/eml/engines/impact-sim.js';
import { ImpactTargetNotFoundError } from '../../src/core/errors.js';

const REPO = '0123456789abcdef';

describe('EML Impact Simulation engine', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let graph: SqliteGraphStore;
  let engine: ImpactSimEngine;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-imp-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    const db = storage.getDatabase();
    graph = new SqliteGraphStore(db);
    const ownership = new OwnershipEngine(db, graph);
    const drift = new DriftEngine(db);
    engine = new ImpactSimEngine(db, { ownership, drift });
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function node(id: string, ref: string, label = 'file'): void {
    storage
      .getDatabase()
      .prepare(`INSERT INTO graph_nodes (id, label, ref, repository_id, props_json) VALUES (?, ?, ?, ?, '{}')`)
      .run(id, label, ref, REPO);
  }

  function edge(id: string, src: string, dst: string): void {
    storage
      .getDatabase()
      .prepare(
        `INSERT INTO graph_edges (id, src, dst, label, repository_id, weight, confidence, valid_from)
         VALUES (?, ?, ?, 'depends_on', ?, 1, 1, '2026-01-01T00:00:00Z')`
      )
      .run(id, src, dst, REPO);
  }

  function rule(ruleType: 'naming', spec: unknown): void {
    new DriftEngine(storage.getDatabase()).addRule({ repositoryId: REPO, ruleType, spec, source: 'declared' });
  }

  it('throws 404 for an unknown target', () => {
    expect(() => engine.simulate({ repositoryId: REPO, op: 'delete', targetRef: 'nope.ts' })).toThrow(
      ImpactTargetNotFoundError
    );
  });

  it('delete: returns transitive dependents', () => {
    node('t', 'core/util.ts');
    node('a', 'a.ts');
    node('b', 'b.ts');
    // a depends on util, b depends on a
    edge('e1', 'a', 't');
    edge('e2', 'b', 'a');
    const res = engine.simulate({ repositoryId: REPO, op: 'delete', targetRef: 'core/util.ts' });
    const refs = res.affected.map((x) => x.ref).sort();
    expect(refs).toEqual(['a.ts', 'b.ts']);
    expect(res.affected.find((x) => x.ref === 'a.ts')!.depth).toBe(1);
    expect(res.affected.find((x) => x.ref === 'b.ts')!.depth).toBe(2);
  });

  it('dependency-removal: returns only direct dependents', () => {
    node('t', 'core/util.ts');
    node('a', 'a.ts');
    node('b', 'b.ts');
    edge('e1', 'a', 't');
    edge('e2', 'b', 'a');
    const res = engine.simulate({ repositoryId: REPO, op: 'dependency-removal', targetRef: 'core/util.ts' });
    expect(res.affected.map((x) => x.ref)).toEqual(['a.ts']);
  });

  it('interface-removal: transitive consumers affected', () => {
    node('t', 'IService', 'symbol');
    node('a', 'a.ts');
    node('b', 'b.ts');
    edge('e1', 'a', 't');
    edge('e2', 'b', 'a');
    const res = engine.simulate({ repositoryId: REPO, op: 'interface-removal', targetRef: 'IService' });
    expect(res.affected.map((x) => x.ref).sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('rename: only direct dependents and detects introduced naming violation', () => {
    node('t', 'src/Widget.tsx', 'symbol');
    node('a', 'consumer.ts');
    edge('e1', 'a', 't');
    rule('naming', { label: 'symbol', pattern: '^[A-Z]' });

    const res = engine.simulate({
      repositoryId: REPO,
      op: 'rename',
      targetRef: 'src/Widget.tsx',
      newRef: 'src/widget.tsx',
    });
    expect(res.affected.map((x) => x.ref)).toEqual(['consumer.ts']);
    expect(res.violationsIntroduced.some((v) => v.ruleType === 'naming' && v.fromRef === 'src/widget.tsx')).toBe(
      true
    );
  });

  it('includes owners to notify', () => {
    const db = storage.getDatabase();
    db.prepare(`INSERT INTO people (id, display_name, emails, aliases) VALUES ('p1', 'Alice', '[]', '[]')`).run();
    db.prepare(
      `INSERT INTO ownership_signals (id, person_id, entity_type, entity_ref, signal, weight, last_activity_at)
       VALUES ('s1', 'p1', 'file', 'a.ts', 'commit', 1, '2026-01-01T00:00:00Z')`
    ).run();
    node('t', 'core/util.ts');
    node('a', 'a.ts');
    edge('e1', 'a', 't');

    const res = engine.simulate({ repositoryId: REPO, op: 'delete', targetRef: 'core/util.ts' });
    expect(res.ownersToNotify.map((o) => o.displayName)).toContain('Alice');
  });
});
