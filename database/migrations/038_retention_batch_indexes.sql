-- Supports fleet-wide bounded retention scans without a table scan per camera.
CREATE INDEX IF NOT EXISTS recording_segments_retention_batch_idx
  ON recording_segments (camera_id, ended_at, started_at)
  WHERE status <> 'deleted';
