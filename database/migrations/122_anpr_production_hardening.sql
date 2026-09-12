-- ============================================================================
-- Migration 122: Automatic Number Plate Recognition (ANPR) Production Hardening
--
-- Adds human-in-the-loop validation, character confidences, plate crop references,
-- fuzzy watchlist matching attributes, vehicle dwell monitoring, and high-throughput indexes.
-- ============================================================================

-- 1. Enhance anpr_events with review workflow, timing, and normalization
ALTER TABLE anpr_events
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS plate_crop_url text,
  ADD COLUMN IF NOT EXISTS processing_time_ms integer,
  ADD COLUMN IF NOT EXISTS normalized_plate text;

-- Add check constraint on review_status if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'anpr_events_review_status_check'
  ) THEN
    ALTER TABLE anpr_events
      ADD CONSTRAINT anpr_events_review_status_check
      CHECK (review_status IN ('pending', 'confirmed', 'false_positive', 'dismissed'));
  END IF;
END $$;

-- Populate normalized_plate for existing records
UPDATE anpr_events
SET normalized_plate = UPPER(REGEXP_REPLACE(plate_number, '[^A-Za-z0-9]', '', 'g'))
WHERE normalized_plate IS NULL;

-- 2. Enhance anpr_watchlist_plates with fuzzy matching and active windows
ALTER TABLE anpr_watchlist_plates
  ADD COLUMN IF NOT EXISTS fuzzy_match boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_levenshtein_distance integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS active_from timestamptz,
  ADD COLUMN IF NOT EXISTS active_to timestamptz,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS normalized_plate text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'anpr_watchlist_plates_priority_check'
  ) THEN
    ALTER TABLE anpr_watchlist_plates
      ADD CONSTRAINT anpr_watchlist_plates_priority_check
      CHECK (priority IN ('critical', 'high', 'medium', 'low'));
  END IF;
END $$;

UPDATE anpr_watchlist_plates
SET normalized_plate = UPPER(REGEXP_REPLACE(plate_number, '[^A-Za-z0-9]', '', 'g'))
WHERE normalized_plate IS NULL;

-- 3. Enhance anpr_vehicle_sessions with dwell tracking and overstay alerts
ALTER TABLE anpr_vehicle_sessions
  ADD COLUMN IF NOT EXISTS max_dwell_minutes integer DEFAULT 720,
  ADD COLUMN IF NOT EXISTS overstay_alerted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vehicle_type text,
  ADD COLUMN IF NOT EXISTS vehicle_color text,
  ADD COLUMN IF NOT EXISTS normalized_plate text;

UPDATE anpr_vehicle_sessions
SET normalized_plate = UPPER(REGEXP_REPLACE(plate_number, '[^A-Za-z0-9]', '', 'g'))
WHERE normalized_plate IS NULL;

-- 4. High-performance composite and partial indexes
CREATE INDEX IF NOT EXISTS anpr_events_tenant_time_idx
  ON anpr_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS anpr_events_normalized_plate_idx
  ON anpr_events (tenant_id, normalized_plate, occurred_at DESC);

CREATE INDEX IF NOT EXISTS anpr_events_review_status_idx
  ON anpr_events (tenant_id, review_status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS anpr_events_camera_time_idx
  ON anpr_events (camera_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS anpr_watchlist_plates_normalized_idx
  ON anpr_watchlist_plates (tenant_id, normalized_plate)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS anpr_vehicle_sessions_active_idx
  ON anpr_vehicle_sessions (tenant_id, status, entry_at DESC);

CREATE INDEX IF NOT EXISTS anpr_vehicle_sessions_normalized_plate_idx
  ON anpr_vehicle_sessions (tenant_id, normalized_plate, entry_at DESC);

-- Comments for schema documentation
COMMENT ON COLUMN anpr_events.review_status IS
  'Human-in-the-loop review state: pending, confirmed, false_positive, or dismissed';
COMMENT ON COLUMN anpr_events.processing_time_ms IS
  'Latency in milliseconds from image capture to OCR and watchlist verification';
COMMENT ON COLUMN anpr_events.normalized_plate IS
  'Standardized uppercase alphanumeric plate number without whitespace or punctuation for rapid querying';
COMMENT ON COLUMN anpr_watchlist_plates.max_levenshtein_distance IS
  'Maximum character edit distance allowed for fuzzy watchlist hit triggering';
