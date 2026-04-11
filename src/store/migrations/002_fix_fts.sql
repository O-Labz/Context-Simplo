-- Migration 002: Fix broken FTS5 search
-- Version: 2
-- Description: Replace contentless FTS5 table with content-synced table + triggers
--
-- The original nodes_fts used content='' (contentless mode), which discards
-- UNINDEXED column values at INSERT time. The node_id join column was always
-- NULL, causing every search to return zero results. This migration rebuilds
-- the table in content-synced mode so SQLite reads from the nodes table
-- directly and triggers keep it in sync automatically.

-- Remove old broken table and any stale manual-sync artifacts
DROP TABLE IF EXISTS nodes_fts;

-- Content-synced FTS5 table: SQLite reads column values from nodes.rowid
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  name,
  qualified_name,
  file_path,
  docstring,
  content='nodes',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

-- Triggers keep FTS5 in sync with nodes table automatically
CREATE TRIGGER nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, name, qualified_name, file_path, docstring)
  VALUES (new.rowid, new.name, new.qualified_name, new.file_path, new.docstring);
END;

CREATE TRIGGER nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name, qualified_name, file_path, docstring)
  VALUES ('delete', old.rowid, old.name, old.qualified_name, old.file_path, old.docstring);
END;

CREATE TRIGGER nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name, qualified_name, file_path, docstring)
  VALUES ('delete', old.rowid, old.name, old.qualified_name, old.file_path, old.docstring);
  INSERT INTO nodes_fts(rowid, name, qualified_name, file_path, docstring)
  VALUES (new.rowid, new.name, new.qualified_name, new.file_path, new.docstring);
END;

-- Populate FTS index from all existing nodes
INSERT INTO nodes_fts(nodes_fts) VALUES ('rebuild');

-- Record migration
INSERT INTO schema_version (version, description) VALUES (2, 'Fix FTS5 search: content-synced table with triggers');
