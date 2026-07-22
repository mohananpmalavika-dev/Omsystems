-- Add enhanced recording job fields for motion detection, pre-roll, events, and storage
-- These columns may already exist if migration 010 was modified in some environments
ALTER TABLE recording_jobs
  ADD COLUMN IF NOT EXISTS pre_roll_seconds integer NOT NULL DEFAULT 30
    CHECK (pre_roll_seconds BETWEEN 0 AND 3600),
  ADD COLUMN IF NOT EXISTS min_motion_duration_seconds integer NOT NULL DEFAULT 0
    CHECK (min_motion_duration_seconds BETWEEN 0 AND 86400),
  ADD COLUMN IF NOT EXISTS motion_confidence_threshold numeric(5,4) NOT NULL DEFAULT 0
    CHECK (motion_confidence_threshold BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS cooldown_seconds integer NOT NULL DEFAULT 60
    CHECK (cooldown_seconds BETWEEN 0 AND 86400),
  ADD COLUMN IF NOT EXISTS max_event_duration_seconds integer NOT NULL DEFAULT 0
    CHECK (max_event_duration_seconds BETWEEN 0 AND 86400),
  ADD COLUMN IF NOT EXISTS storage_node_external_id text,
  ADD COLUMN IF NOT EXISTS trigger_event_types text[];
