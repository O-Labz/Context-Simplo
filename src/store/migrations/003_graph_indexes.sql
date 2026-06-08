-- Graph traversal performance indexes
-- Version: 3
-- Description: Add indexes for name lookup and edge traversal

-- Name lookup index (exact match for StorageBackedGraph.findByName)
CREATE INDEX IF NOT EXISTS idx_nodes_name_lookup ON nodes(name);

-- Edge traversal indexes for graph analysis
CREATE INDEX IF NOT EXISTS idx_edges_source_lookup ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target_lookup ON edges(target_id);

-- Insert migration version
INSERT INTO schema_version (version, description) VALUES (3, 'graph lookup indexes');