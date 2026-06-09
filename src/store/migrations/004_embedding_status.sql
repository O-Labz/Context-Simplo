-- Embedding status tracking for background backfill
-- Version: 4
-- Description: Add embedding_status for background backfill

-- Add embedding_status column with default 'pending'
ALTER TABLE files ADD COLUMN embedding_status TEXT DEFAULT 'pending';

-- Partial index for efficient pending file lookup (only indexes rows where embedding_status = 'pending')
CREATE INDEX IF NOT EXISTS idx_files_embedding_status ON files(embedding_status) WHERE embedding_status = 'pending';

-- Insert migration version
INSERT INTO schema_version (version, description) VALUES (4, 'Add embedding_status for background backfill');
