-- Code references table for incremental edge resolution
-- Version: 5
-- Description: Add code_references table for tracking unresolved calls and imports

-- Code references table tracks all reference sites for incremental resolution
CREATE TABLE IF NOT EXISTS code_references (
  id TEXT PRIMARY KEY,
  source_file TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  target_name TEXT NOT NULL,
  reference_kind TEXT NOT NULL CHECK(reference_kind IN ('call', 'import')),
  line_number INTEGER NOT NULL,
  repository_id TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
  FOREIGN KEY (source_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Index for finding references by source file (for deletion on file reindex)
CREATE INDEX IF NOT EXISTS idx_code_references_source_file ON code_references(source_file);

-- Index for finding references by target name (for resolution when new nodes are added)
CREATE INDEX IF NOT EXISTS idx_code_references_target_name ON code_references(target_name);

-- Index for finding unresolved references (for batch resolution)
CREATE INDEX IF NOT EXISTS idx_code_references_unresolved ON code_references(resolved) WHERE resolved = 0;

-- Index for repository-scoped cleanup
CREATE INDEX IF NOT EXISTS idx_code_references_repository ON code_references(repository_id);

-- Insert migration version
INSERT INTO schema_version (version, description) VALUES (5, 'Add code_references table for incremental resolution');
