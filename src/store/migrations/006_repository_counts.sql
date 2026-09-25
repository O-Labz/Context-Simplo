-- Backfill per-repository node and edge counts
-- Version: 6
-- Description: Update repositories.node_count and repositories.edge_count from scoped graph counts

UPDATE repositories
SET node_count = (
  SELECT COUNT(*) FROM nodes WHERE nodes.repository_id = repositories.id
),
edge_count = (
  SELECT COUNT(*)
  FROM edges e
  JOIN nodes n ON n.id = e.source_id
  WHERE n.repository_id = repositories.id
),
updated_at = datetime('now');

INSERT INTO schema_version (version, description) VALUES (6, 'Backfill repository node_count and edge_count');
