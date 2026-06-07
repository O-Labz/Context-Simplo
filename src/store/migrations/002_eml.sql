-- Engineering Memory Layer (EML) schema
-- Version: 2
-- Description: Event store, fact tables, SQLite-native graph, and FTS for memories.

-- Append-only event store
CREATE TABLE IF NOT EXISTS eml_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  actor TEXT,
  payload TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'done', 'error')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_eml_events_status ON eml_events(status);
CREATE INDEX IF NOT EXISTS idx_eml_events_repository ON eml_events(repository_id);
CREATE INDEX IF NOT EXISTS idx_eml_events_type ON eml_events(type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_eml_events_content_hash ON eml_events(content_hash);

-- Core memory record
CREATE TABLE IF NOT EXISTS memory_objects (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('decision', 'failure', 'intent', 'gap', 'ownership', 'note')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  freshness REAL NOT NULL DEFAULT 1,
  contradiction_score REAL NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 1,
  last_verified_at TEXT,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  superseded_by TEXT REFERENCES memory_objects(id),
  embedding_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memory_objects_kind ON memory_objects(kind);
CREATE INDEX IF NOT EXISTS idx_memory_objects_repository ON memory_objects(repository_id);
CREATE INDEX IF NOT EXISTS idx_memory_objects_superseded_by ON memory_objects(superseded_by);

-- Decision-specific fields
CREATE TABLE IF NOT EXISTS decisions (
  memory_id TEXT PRIMARY KEY REFERENCES memory_objects(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL,
  alternatives TEXT NOT NULL,
  tradeoffs TEXT NOT NULL,
  decision_date TEXT NOT NULL,
  author TEXT,
  affected_systems TEXT NOT NULL,
  status TEXT NOT NULL
);

-- Failure-specific fields
CREATE TABLE IF NOT EXISTS failures (
  memory_id TEXT PRIMARY KEY REFERENCES memory_objects(id) ON DELETE CASCADE,
  failure_type TEXT NOT NULL CHECK(failure_type IN ('failed_impl', 'abandoned_migration', 'rejected_tech', 'pitfall', 'incident')),
  what_failed TEXT NOT NULL,
  why_failed TEXT NOT NULL,
  lessons TEXT NOT NULL,
  root_cause TEXT,
  incident_ref TEXT
);

-- Intent-specific fields
CREATE TABLE IF NOT EXISTS intents (
  memory_id TEXT PRIMARY KEY REFERENCES memory_objects(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'achieved', 'abandoned')),
  priority INTEGER NOT NULL,
  target_date TEXT
);

-- Provenance linking memories to source events
CREATE TABLE IF NOT EXISTS provenance (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memory_objects(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES eml_events(id),
  source_type TEXT NOT NULL CHECK(source_type IN ('diff', 'structural_delta', 'conversation', 'pr', 'issue', 'commit_message', 'agent')),
  source_ref TEXT NOT NULL,
  snippet TEXT,
  weight REAL NOT NULL,
  verified_against_diff INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_provenance_memory ON provenance(memory_id);

-- Contradictions between memories
CREATE TABLE IF NOT EXISTS contradictions (
  id TEXT PRIMARY KEY,
  memory_a TEXT NOT NULL REFERENCES memory_objects(id) ON DELETE CASCADE,
  memory_b TEXT NOT NULL REFERENCES memory_objects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  resolution TEXT,
  resolved_by TEXT
);

-- People identity registry
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  emails TEXT NOT NULL,
  aliases TEXT NOT NULL
);

-- Ownership signals
CREATE TABLE IF NOT EXISTS ownership_signals (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('file', 'service', 'repo', 'symbol')),
  entity_ref TEXT NOT NULL,
  signal TEXT NOT NULL CHECK(signal IN ('commit', 'review', 'authorship', 'discussion')),
  weight REAL NOT NULL,
  last_activity_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ownership_signals_entity ON ownership_signals(entity_type, entity_ref);

-- Links from memories to code entities
CREATE TABLE IF NOT EXISTS entity_links (
  memory_id TEXT NOT NULL REFERENCES memory_objects(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK(target_kind IN ('node', 'file', 'service', 'symbol')),
  target_ref TEXT NOT NULL,
  PRIMARY KEY (memory_id, target_kind, target_ref)
);

-- Declared/inferred architecture rules
CREATE TABLE IF NOT EXISTS architecture_rules (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK(rule_type IN ('layer', 'allowed_dep', 'forbidden_dep', 'naming')),
  spec TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('declared', 'inferred')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_architecture_rules_repository ON architecture_rules(repository_id);

-- SQLite-native graph: nodes
CREATE TABLE IF NOT EXISTS graph_nodes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  ref TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  props_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_label ON graph_nodes(label);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_repository ON graph_nodes(repository_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_ref ON graph_nodes(ref);

-- SQLite-native graph: edges
CREATE TABLE IF NOT EXISTS graph_edges (
  id TEXT PRIMARY KEY,
  src TEXT NOT NULL,
  dst TEXT NOT NULL,
  label TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  confidence REAL NOT NULL DEFAULT 1,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  props_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_src ON graph_edges(src);
CREATE INDEX IF NOT EXISTS idx_graph_edges_dst ON graph_edges(dst);
CREATE INDEX IF NOT EXISTS idx_graph_edges_label ON graph_edges(label);
CREATE INDEX IF NOT EXISTS idx_graph_edges_repository ON graph_edges(repository_id);

-- FTS5 external-content index over memory_objects
CREATE VIRTUAL TABLE IF NOT EXISTS eml_memory_fts USING fts5(
  title,
  summary,
  body,
  content='memory_objects',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS eml_memory_ai AFTER INSERT ON memory_objects BEGIN
  INSERT INTO eml_memory_fts(rowid, title, summary, body)
  VALUES (new.rowid, new.title, new.summary, new.body);
END;

CREATE TRIGGER IF NOT EXISTS eml_memory_ad AFTER DELETE ON memory_objects BEGIN
  INSERT INTO eml_memory_fts(eml_memory_fts, rowid, title, summary, body)
  VALUES ('delete', old.rowid, old.title, old.summary, old.body);
END;

CREATE TRIGGER IF NOT EXISTS eml_memory_au AFTER UPDATE ON memory_objects BEGIN
  INSERT INTO eml_memory_fts(eml_memory_fts, rowid, title, summary, body)
  VALUES ('delete', old.rowid, old.title, old.summary, old.body);
  INSERT INTO eml_memory_fts(rowid, title, summary, body)
  VALUES (new.rowid, new.title, new.summary, new.body);
END;

-- Record schema version
INSERT INTO schema_version (version, description) VALUES (2, 'eml');
