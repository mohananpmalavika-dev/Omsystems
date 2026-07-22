-- Migration 021: Video Search & Forensic Evidence Infrastructure
-- Module 2.5: Video Search, Playback & Forensic Analysis
-- Adds search indexing, motion/object detection metadata, enhanced bookmarks,
-- forensic export tracking, and verification infrastructure

-- ============================================================================
-- SEARCH INDEX & METADATA
-- ============================================================================

-- Recording Search Index
-- Pre-computed search metadata for fast queries
CREATE TABLE IF NOT EXISTS recording_search_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES recording_segments(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL,
  recording_type text NOT NULL DEFAULT 'continuous'
    CHECK (recording_type IN ('continuous', 'motion', 'scheduled', 'event', 'manual')),
  has_motion boolean NOT NULL DEFAULT false,
  has_ai_events boolean NOT NULL DEFAULT false,
  event_count integer NOT NULL DEFAULT 0,
  object_count integer NOT NULL DEFAULT 0,
  quality_score numeric(3,2) CHECK (quality_score >= 0 AND quality_score <= 1),
  indexed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (segment_id)
);

CREATE INDEX recording_search_index_camera_time_idx 
  ON recording_search_index (camera_id, started_at DESC, ended_at DESC);
CREATE INDEX recording_search_index_tenant_time_idx 
  ON recording_search_index (tenant_id, started_at DESC);
CREATE INDEX recording_search_index_motion_idx 
  ON recording_search_index (camera_id, has_motion, started_at DESC)
  WHERE has_motion = true;
CREATE INDEX recording_search_index_events_idx 
  ON recording_search_index (camera_id, has_ai_events, started_at DESC)
  WHERE has_ai_events = true;

-- Motion Events
-- Stores detected motion regions and metadata
CREATE TABLE IF NOT EXISTS motion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES recording_segments(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL,
  confidence numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  motion_area_percent numeric(5,2) CHECK (motion_area_percent >= 0 AND motion_area_percent <= 100),
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  zone_name text,
  region jsonb, -- Bounding box coordinates
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX motion_events_camera_time_idx 
  ON motion_events (camera_id, started_at DESC);
CREATE INDEX motion_events_zone_idx 
  ON motion_events (zone_id, started_at DESC)
  WHERE zone_id IS NOT NULL;
CREATE INDEX motion_events_duration_idx 
  ON motion_events (camera_id, duration_seconds DESC)
  WHERE duration_seconds >= 10;

-- Detected Objects
-- AI analytics detections from analytics engine
CREATE TABLE IF NOT EXISTS detected_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid REFERENCES recording_segments(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  detected_at timestamptz NOT NULL,
  object_class text NOT NULL CHECK (length(object_class) BETWEEN 1 AND 50),
  confidence numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  bounding_box jsonb NOT NULL, -- {x, y, width, height}
  attributes jsonb, -- color, direction, etc.
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  alert_id uuid REFERENCES alerts(id) ON DELETE SET NULL,
  thumbnail_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX detected_objects_camera_time_idx 
  ON detected_objects (camera_id, detected_at DESC);
CREATE INDEX detected_objects_class_idx 
  ON detected_objects (object_class, camera_id, detected_at DESC);
CREATE INDEX detected_objects_alert_idx 
  ON detected_objects (alert_id)
  WHERE alert_id IS NOT NULL;
CREATE INDEX detected_objects_segment_idx 
  ON detected_objects (segment_id)
  WHERE segment_id IS NOT NULL;

-- ============================================================================
-- ENHANCED BOOKMARKS & TIMELINE MARKERS
-- ============================================================================

-- Extend existing live_bookmarks table with additional forensic fields
ALTER TABLE live_bookmarks
  ADD COLUMN IF NOT EXISTS recording_segment_id uuid REFERENCES recording_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snapshot_reference text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS evidence_case_id uuid REFERENCES evidence_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS frame_offset_ms integer CHECK (frame_offset_ms >= 0),
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE INDEX IF NOT EXISTS live_bookmarks_evidence_case_idx 
  ON live_bookmarks (evidence_case_id, created_at DESC)
  WHERE evidence_case_id IS NOT NULL;

-- Timeline Markers
-- Visual markers for timeline visualization (events, alerts, bookmarks, incidents)
CREATE TABLE IF NOT EXISTS timeline_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  marker_type text NOT NULL 
    CHECK (marker_type IN ('motion', 'alert', 'bookmark', 'incident', 'gap', 'legal-hold', 'export')),
  severity text CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text,
  reference_id uuid, -- Links to alert, bookmark, incident, etc.
  color text, -- Hex color for visualization
  icon text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX timeline_markers_camera_time_idx 
  ON timeline_markers (camera_id, timestamp DESC);
CREATE INDEX timeline_markers_type_idx 
  ON timeline_markers (camera_id, marker_type, timestamp DESC);

-- ============================================================================
-- FORENSIC EXPORT INFRASTRUCTURE
-- ============================================================================

-- Forensic Export Jobs
-- Tracks evidence export requests and processing
CREATE TABLE IF NOT EXISTS forensic_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES evidence_cases(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  export_type text NOT NULL 
    CHECK (export_type IN ('original', 'viewing-copy', 'multi-camera', 'investigation-package')),
  format text NOT NULL 
    CHECK (format IN ('original', 'mp4', 'mkv', 'manifest-only')),
  cameras jsonb NOT NULL, -- Array of camera IDs and time ranges
  options jsonb NOT NULL DEFAULT '{}'::jsonb, -- watermark, overlay, audio, password
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'processing', 'transcoding', 'packaging', 'signing', 'ready', 'failed', 'expired')),
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 1000),
  requested_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 1000),
  total_segments integer DEFAULT 0,
  processed_segments integer DEFAULT 0,
  total_bytes bigint DEFAULT 0,
  output_path text,
  output_size_bytes bigint,
  output_hash_sha256 text CHECK (output_hash_sha256 IS NULL OR output_hash_sha256 ~ '^[a-f0-9]{64}$'),
  manifest_id uuid REFERENCES evidence_manifests(id),
  download_token text UNIQUE,
  download_expires_at timestamptz,
  download_count integer NOT NULL DEFAULT 0,
  max_downloads integer DEFAULT 5,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX forensic_export_jobs_case_idx 
  ON forensic_export_jobs (case_id, status, created_at DESC);
CREATE INDEX forensic_export_jobs_status_priority_idx 
  ON forensic_export_jobs (status, priority DESC, created_at ASC)
  WHERE status IN ('pending', 'queued');
CREATE INDEX forensic_export_jobs_download_token_idx 
  ON forensic_export_jobs (download_token)
  WHERE download_token IS NOT NULL AND status = 'ready';

-- Export Verification Log
-- Tracks every verification of exported evidence
CREATE TABLE IF NOT EXISTS export_verification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_job_id uuid NOT NULL REFERENCES forensic_export_jobs(id) ON DELETE CASCADE,
  verified_by uuid NOT NULL REFERENCES users(id),
  verification_type text NOT NULL 
    CHECK (verification_type IN ('integrity', 'timestamp', 'chain-of-custody', 'signature')),
  status text NOT NULL 
    CHECK (status IN ('verified', 'mismatch', 'missing', 'tampered', 'inconclusive')),
  expected_hash text,
  actual_hash text,
  details jsonb,
  verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX export_verification_log_job_idx 
  ON export_verification_log (export_job_id, verified_at DESC);
CREATE INDEX export_verification_log_status_idx 
  ON export_verification_log (status, verified_at DESC)
  WHERE status IN ('mismatch', 'tampered');

-- ============================================================================
-- SNAPSHOT ENHANCEMENTS
-- ============================================================================

-- Extend recording_snapshots with forensic fields
ALTER TABLE recording_snapshots
  ADD COLUMN IF NOT EXISTS snapshot_type text NOT NULL DEFAULT 'manual'
    CHECK (snapshot_type IN ('manual', 'automatic', 'forensic', 'investigation')),
  ADD COLUMN IF NOT EXISTS original_storage_path text,
  ADD COLUMN IF NOT EXISTS original_hash_sha256 text CHECK (original_hash_sha256 IS NULL OR original_hash_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS annotated_storage_path text,
  ADD COLUMN IF NOT EXISTS annotated_hash_sha256 text CHECK (annotated_hash_sha256 IS NULL OR annotated_hash_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS width integer CHECK (width > 0),
  ADD COLUMN IF NOT EXISTS height integer CHECK (height > 0),
  ADD COLUMN IF NOT EXISTS format text CHECK (format IN ('jpg', 'png', 'bmp')),
  ADD COLUMN IF NOT EXISTS evidence_case_id uuid REFERENCES evidence_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS recording_snapshots_evidence_idx 
  ON recording_snapshots (evidence_case_id, timestamp DESC)
  WHERE evidence_case_id IS NOT NULL;

-- ============================================================================
-- MANIFEST ENHANCEMENTS
-- ============================================================================

-- Extend evidence_manifests with comprehensive timestamp verification
ALTER TABLE evidence_manifests
  ADD COLUMN IF NOT EXISTS version text NOT NULL DEFAULT 'v1.0',
  ADD COLUMN IF NOT EXISTS export_job_id uuid REFERENCES forensic_export_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cameras jsonb, -- Camera metadata at export time
  ADD COLUMN IF NOT EXISTS ntp_verification jsonb, -- NTP sync status for each camera
  ADD COLUMN IF NOT EXISTS clock_offsets jsonb, -- Clock drift measurements
  ADD COLUMN IF NOT EXISTS export_chain jsonb, -- Full export processing chain
  ADD COLUMN IF NOT EXISTS watermark_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_protected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expiry_date timestamptz,
  ADD COLUMN IF NOT EXISTS verification_url text,
  ADD COLUMN IF NOT EXISTS digital_signature text,
  ADD COLUMN IF NOT EXISTS signing_key_id text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz;

-- ============================================================================
-- PLAYBACK SESSION TRACKING
-- ============================================================================

-- Playback Sessions
-- Tracks viewing sessions for audit purposes
CREATE TABLE IF NOT EXISTS playback_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  from_time timestamptz NOT NULL,
  to_time timestamptz NOT NULL,
  segments_accessed uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  evidence_case_id uuid REFERENCES evidence_cases(id) ON DELETE SET NULL,
  reason text,
  source_ip text NOT NULL,
  user_agent text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  actions_performed jsonb DEFAULT '[]'::jsonb -- snapshot, bookmark, export, etc.
);

CREATE INDEX playback_sessions_user_idx 
  ON playback_sessions (user_id, started_at DESC);
CREATE INDEX playback_sessions_camera_idx 
  ON playback_sessions (camera_id, started_at DESC);
CREATE INDEX playback_sessions_evidence_idx 
  ON playback_sessions (evidence_case_id, started_at DESC)
  WHERE evidence_case_id IS NOT NULL;

-- ============================================================================
-- SYNCHRONIZED PLAYBACK
-- ============================================================================

-- Multi-Camera Playback Groups
-- Stores configurations for synchronized multi-camera playback
CREATE TABLE IF NOT EXISTS playback_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description text,
  camera_ids uuid[] NOT NULL,
  master_camera_id uuid NOT NULL REFERENCES cameras(id),
  time_offsets jsonb, -- Camera-specific time offset corrections
  layout text NOT NULL DEFAULT 'grid' CHECK (layout IN ('grid', 'stacked', 'custom')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX playback_groups_tenant_idx 
  ON playback_groups (tenant_id, created_at DESC);

-- ============================================================================
-- SEARCH QUERIES & FILTERS
-- ============================================================================

-- Saved Search Queries
-- Allows users to save and reuse complex search filters
CREATE TABLE IF NOT EXISTS saved_search_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description text,
  query_filters jsonb NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX saved_search_queries_user_idx 
  ON saved_search_queries (user_id, created_at DESC);
CREATE INDEX saved_search_queries_public_idx 
  ON saved_search_queries (tenant_id, is_public, created_at DESC)
  WHERE is_public = true;

-- ============================================================================
-- VIEWS FOR SEARCH & ANALYTICS
-- ============================================================================

-- Recording Coverage Summary
CREATE OR REPLACE VIEW recording_coverage_summary AS
SELECT 
  c.id AS camera_id,
  c.name AS camera_name,
  rn.id AS node_id,
  COUNT(rs.id) AS segment_count,
  SUM(rs.size_bytes) AS total_bytes,
  SUM(EXTRACT(EPOCH FROM (rs.ended_at - rs.started_at))) AS total_seconds,
  MIN(rs.started_at) AS earliest_recording,
  MAX(rs.ended_at) AS latest_recording,
  COUNT(CASE WHEN rs.status = 'ready' THEN 1 END) AS ready_segments,
  COUNT(CASE WHEN rs.storage_tier = 'hot' THEN 1 END) AS hot_segments,
  COUNT(CASE WHEN rs.storage_tier = 'warm' THEN 1 END) AS warm_segments,
  COUNT(CASE WHEN rs.storage_tier = 'cold' THEN 1 END) AS cold_segments
FROM cameras c
JOIN resource_nodes rn ON rn.id = c.resource_node_id
LEFT JOIN recording_segments rs ON rs.camera_id = c.id AND rs.status <> 'deleted'
GROUP BY c.id, c.name, rn.id;

-- Evidence Cases with Item Counts
CREATE OR REPLACE VIEW evidence_cases_summary AS
SELECT 
  ec.id,
  ec.tenant_id,
  ec.case_number,
  ec.title,
  ec.status,
  ec.created_at,
  COUNT(DISTINCT ei.id) AS item_count,
  COUNT(DISTINCT CASE WHEN ei.type = 'recording' THEN ei.id END) AS recording_count,
  COUNT(DISTINCT CASE WHEN ei.type = 'snapshot' THEN ei.id END) AS snapshot_count,
  COUNT(DISTINCT ee.id) AS export_count,
  COUNT(DISTINCT CASE WHEN ee.status = 'ready' THEN ee.id END) AS ready_export_count,
  SUM(ee.total_bytes) AS total_export_bytes
FROM evidence_cases ec
LEFT JOIN evidence_items ei ON ei.case_id = ec.id
LEFT JOIN evidence_exports ee ON ee.case_id = ec.id
GROUP BY ec.id, ec.tenant_id, ec.case_number, ec.title, ec.status, ec.created_at;

-- Active Legal Holds
CREATE OR REPLACE VIEW active_legal_holds AS
SELECT 
  rlh.*,
  c.name AS camera_name,
  rn.name AS branch_name,
  u_created.email AS created_by_email,
  u_released.email AS released_by_email
FROM recording_legal_holds rlh
JOIN cameras c ON c.id = rlh.camera_id
JOIN resource_nodes rn ON rn.id = c.resource_node_id
LEFT JOIN users u_created ON u_created.id = rlh.created_by
LEFT JOIN users u_released ON u_released.id = rlh.released_by
WHERE rlh.released_at IS NULL
ORDER BY rlh.created_at DESC;

-- ============================================================================
-- FUNCTIONS FOR SEARCH OPTIMIZATION
-- ============================================================================

-- Function to update search index from recording segment
CREATE OR REPLACE FUNCTION update_recording_search_index()
RETURNS TRIGGER AS $$
BEGIN
  -- Only index ready segments
  IF NEW.status = 'ready' THEN
    INSERT INTO recording_search_index (
      segment_id, camera_id, tenant_id, started_at, ended_at, duration_seconds,
      recording_type, indexed_at
    )
    SELECT 
      NEW.id,
      NEW.camera_id,
      rn.tenant_id,
      NEW.started_at,
      NEW.ended_at,
      EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::integer,
      rj.mode,
      now()
    FROM cameras c
    JOIN resource_nodes rn ON rn.id = c.resource_node_id
    LEFT JOIN recording_jobs rj ON rj.camera_id = c.id
    WHERE c.id = NEW.camera_id
    ON CONFLICT (segment_id) DO UPDATE SET
      started_at = EXCLUDED.started_at,
      ended_at = EXCLUDED.ended_at,
      duration_seconds = EXCLUDED.duration_seconds,
      indexed_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically index new segments
DROP TRIGGER IF EXISTS recording_segment_search_index_trigger ON recording_segments;
CREATE TRIGGER recording_segment_search_index_trigger
  AFTER INSERT OR UPDATE OF status ON recording_segments
  FOR EACH ROW
  EXECUTE FUNCTION update_recording_search_index();

-- Function to update search index with motion events
CREATE OR REPLACE FUNCTION update_search_index_motion()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE recording_search_index
  SET 
    has_motion = true,
    event_count = event_count + 1
  WHERE segment_id = NEW.segment_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS motion_event_search_trigger ON motion_events;
CREATE TRIGGER motion_event_search_trigger
  AFTER INSERT ON motion_events
  FOR EACH ROW
  EXECUTE FUNCTION update_search_index_motion();

-- Function to update search index with AI detections
CREATE OR REPLACE FUNCTION update_search_index_objects()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE recording_search_index
  SET 
    has_ai_events = true,
    object_count = object_count + 1
  WHERE segment_id = NEW.segment_id AND NEW.segment_id IS NOT NULL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS detected_object_search_trigger ON detected_objects;
CREATE TRIGGER detected_object_search_trigger
  AFTER INSERT ON detected_objects
  FOR EACH ROW
  WHEN (NEW.segment_id IS NOT NULL)
  EXECUTE FUNCTION update_search_index_objects();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE recording_search_index IS 'Pre-computed search metadata for fast recording queries';
COMMENT ON TABLE motion_events IS 'Motion detection events with spatial and temporal metadata';
COMMENT ON TABLE detected_objects IS 'AI-detected objects from analytics engine (person, vehicle, etc.)';
COMMENT ON TABLE timeline_markers IS 'Visual markers for timeline visualization (events, bookmarks, gaps)';
COMMENT ON TABLE forensic_export_jobs IS 'Evidence export requests with approval workflow and tracking';
COMMENT ON TABLE export_verification_log IS 'Audit trail for evidence integrity verification';
COMMENT ON TABLE playback_sessions IS 'Tracks user viewing sessions for compliance and audit';
COMMENT ON TABLE playback_groups IS 'Multi-camera synchronized playback configurations';
COMMENT ON TABLE saved_search_queries IS 'Saved search filters for quick access';

COMMENT ON COLUMN forensic_export_jobs.export_type IS 'Type: original (untranscoded), viewing-copy (MP4), multi-camera (synchronized), investigation-package (full bundle)';
COMMENT ON COLUMN forensic_export_jobs.download_token IS 'Secure token for authorized download with expiry';
COMMENT ON COLUMN forensic_export_jobs.max_downloads IS 'Maximum allowed downloads before requiring re-authorization';
