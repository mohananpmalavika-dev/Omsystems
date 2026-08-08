-- Migration 046: Video Indexing Queue
-- Supports automated video search indexing pipeline

-- Video Indexing Queue
-- Tracks pending and completed video indexing jobs
CREATE TABLE IF NOT EXISTS video_indexing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES recording_segments(id) ON DELETE CASCADE,
  
  -- Job Details
  video_path TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 1000),
  
  -- Results
  objects_indexed INTEGER DEFAULT 0,
  embeddings_generated INTEGER DEFAULT 0,
  tracking_ids_assigned INTEGER DEFAULT 0,
  processing_time_ms INTEGER,
  
  -- Error Handling
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Ensure we don't index the same segment twice
  UNIQUE (segment_id)
);

CREATE INDEX video_indexing_queue_status_priority_idx 
  ON video_indexing_queue (status, priority DESC, created_at ASC)
  WHERE status IN ('pending', 'processing');

CREATE INDEX video_indexing_queue_tenant_status_idx 
  ON video_indexing_queue (tenant_id, status, created_at DESC);

CREATE INDEX video_indexing_queue_camera_idx 
  ON video_indexing_queue (camera_id, created_at DESC);

CREATE INDEX video_indexing_queue_completed_idx 
  ON video_indexing_queue (tenant_id, completed_at DESC)
  WHERE status = 'completed';

-- Add comments
COMMENT ON TABLE video_indexing_queue IS 'Queue for automated video search indexing jobs';
COMMENT ON COLUMN video_indexing_queue.priority IS 'Higher number = higher priority (1-1000)';
COMMENT ON COLUMN video_indexing_queue.retry_count IS 'Number of times this job has been retried after failure';
