-- Migration: 145_fix_detected_objects_columns.sql
-- Purpose: Ensure detected_objects has event_id, label, and track_id columns expected by analytics ingestion
-- Date: 2026-09-15

ALTER TABLE detected_objects
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES analytics_events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS track_id text;

CREATE INDEX IF NOT EXISTS detected_objects_event_idx
  ON detected_objects (event_id)
  WHERE event_id IS NOT NULL;
