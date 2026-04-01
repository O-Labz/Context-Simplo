-- Add missing columns to edges table
-- Version: 2
-- Description: Add repository_id and updated_at columns to edges table

-- Add repository_id column
ALTER TABLE edges ADD COLUMN repository_id TEXT;

-- Add updated_at column
ALTER TABLE edges ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

-- Create index on repository_id for efficient filtering
CREATE INDEX IF NOT EXISTS idx_edges_repository ON edges(repository_id);

-- Backfill repository_id from source node
UPDATE edges
SET repository_id = (
  SELECT repository_id
  FROM nodes
  WHERE nodes.id = edges.source_id
);

-- Insert schema version
INSERT INTO schema_version (version, description) VALUES (2, 'Add repository_id and updated_at to edges');
