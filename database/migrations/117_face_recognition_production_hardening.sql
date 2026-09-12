-- ============================================================================
-- Migration 117: Face Recognition & Watchlist Matching Production Hardening
--
-- Adds review status tracking, operational indexes, and audit capabilities
-- for enterprise face recognition and watchlist matching.
-- ============================================================================

-- Ensure pgvector extension exists (if available in database environment)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension not installed in current environment; proceeding with standard schema';
END $$;

-- Add human-in-the-loop review columns to face_recognition_events
ALTER TABLE face_recognition_events
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

-- Add check constraint on review_status if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'face_recognition_events_review_status_check'
  ) THEN
    ALTER TABLE face_recognition_events
      ADD CONSTRAINT face_recognition_events_review_status_check
      CHECK (review_status IN ('pending', 'confirmed', 'rejected', 'dismissed'));
  END IF;
END $$;

-- Add last seen camera reference on face_watchlist_persons
ALTER TABLE face_watchlist_persons
  ADD COLUMN IF NOT EXISTS last_seen_camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL;

-- High-performance composite indexes for real-time dashboard and search
CREATE INDEX IF NOT EXISTS face_recognition_events_tenant_time_idx
  ON face_recognition_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS face_recognition_events_watchlist_time_idx
  ON face_recognition_events (watchlist_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS face_recognition_events_review_status_idx
  ON face_recognition_events (tenant_id, review_status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS face_match_reviews_tenant_time_idx
  ON face_match_reviews (tenant_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS face_watchlist_persons_tenant_lookup_idx
  ON face_watchlist_persons (tenant_id, watchlist_id)
  WHERE archived_at IS NULL;

-- Audit trail comments
COMMENT ON COLUMN face_recognition_events.review_status IS
  'Human-in-the-loop validation state: pending, confirmed, rejected, or dismissed';
COMMENT ON COLUMN face_recognition_events.reviewed_by IS
  'User ID of the security operator or investigator who verified this match';
COMMENT ON COLUMN face_recognition_events.reviewed_at IS
  'Timestamp when the operator completed the human review';
