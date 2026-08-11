/**
 * Journey System Database Migration
 * 
 * Creates all tables for cross-camera journey tracking:
 * - global_person: Cross-camera identity entities
 * - person_observation: Track records on individual cameras
 * - person_transition: Transitions between observations
 * - camera_transition_rule: Topology rules
 * - Extensions to reid_embeddings: Journey-specific columns
 */

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgvector extension for embeddings (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- GLOBAL PERSON TABLE
-- Cross-camera identity entities
-- =====================================================
CREATE TABLE IF NOT EXISTS global_person (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  branch_id UUID,
  known_identity_id TEXT, -- Link to watchlist/employee if identified
  
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  
  confidence NUMERIC(4,3) NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  merged_into_id TEXT, -- If merged, points to target identity
  
  metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_gp_confidence_range CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT chk_gp_status CHECK (status IN ('ACTIVE', 'MERGED', 'SPLIT', 'ARCHIVED')),
  CONSTRAINT chk_gp_time_order CHECK (last_seen_at >= first_seen_at)
);

CREATE INDEX idx_global_person_tenant 
ON global_person (tenant_id, last_seen_at DESC)
WHERE status = 'ACTIVE';

CREATE INDEX idx_global_person_known_identity 
ON global_person (tenant_id, known_identity_id)
WHERE known_identity_id IS NOT NULL;

COMMENT ON TABLE global_person IS 'Cross-camera identity entities for journey tracking';

-- =====================================================
-- PERSON OBSERVATION TABLE
-- Track records on individual cameras
-- =====================================================
CREATE TABLE IF NOT EXISTS person_observation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  
  global_person_id TEXT, -- NULL until identity resolved
  
  camera_id UUID NOT NULL,
  track_id TEXT NOT NULL, -- Local tracker ID
  
  entered_at TIMESTAMPTZ NOT NULL,
  exited_at TIMESTAMPTZ NOT NULL,
  
  representative_embedding_id UUID, -- Links to reid_embedding table
  
  detection_confidence NUMERIC(4,3) NOT NULL,
  embedding_quality NUMERIC(4,3),
  identity_confidence NUMERIC(4,3), -- Confidence in global identity assignment
  
  entry_zone_id TEXT, -- Zone where person entered frame
  exit_zone_id TEXT, -- Zone where person exited frame
  
  first_frame_id TEXT,
  last_frame_id TEXT,
  
  thumbnail_uri TEXT, -- Path to representative image
  
  association_method TEXT NOT NULL DEFAULT 'UNKNOWN',
  model_version TEXT,
  
  metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_obs_confidence_range CHECK (
    detection_confidence >= 0 AND detection_confidence <= 1 AND
    (embedding_quality IS NULL OR (embedding_quality >= 0 AND embedding_quality <= 1)) AND
    (identity_confidence IS NULL OR (identity_confidence >= 0 AND identity_confidence <= 1))
  ),
  CONSTRAINT chk_obs_time_order CHECK (exited_at >= entered_at),
  CONSTRAINT chk_obs_association_method CHECK (
    association_method IN ('LOCAL_TRACK', 'REID', 'TOPOLOGY_REID', 'MANUAL', 'UNKNOWN')
  )
);

CREATE INDEX idx_person_obs_global_time 
ON person_observation (tenant_id, global_person_id, entered_at DESC)
WHERE global_person_id IS NOT NULL;

CREATE INDEX idx_person_obs_camera_time 
ON person_observation (tenant_id, camera_id, entered_at DESC);

CREATE INDEX idx_person_obs_branch_time 
ON person_observation (tenant_id, branch_id, entered_at DESC);

CREATE INDEX idx_person_obs_track 
ON person_observation (tenant_id, camera_id, track_id);

CREATE INDEX idx_person_obs_unresolved 
ON person_observation (tenant_id, created_at DESC)
WHERE global_person_id IS NULL;

COMMENT ON TABLE person_observation IS 'Persistent records of person tracks on individual cameras';

-- =====================================================
-- PERSON TRANSITION TABLE
-- Transitions between observations
-- =====================================================
CREATE TABLE IF NOT EXISTS person_transition (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  
  global_person_id TEXT NOT NULL,
  
  from_observation_id UUID NOT NULL,
  to_observation_id UUID NOT NULL,
  
  from_camera_id UUID NOT NULL,
  to_camera_id UUID NOT NULL,
  
  departed_at TIMESTAMPTZ NOT NULL,
  arrived_at TIMESTAMPTZ NOT NULL,
  
  travel_time_ms INTEGER NOT NULL,
  
  -- Confidence components
  reid_similarity NUMERIC(4,3),
  topology_score NUMERIC(4,3),
  temporal_score NUMERIC(4,3),
  zone_score NUMERIC(4,3),
  
  transition_confidence NUMERIC(4,3) NOT NULL,
  
  status TEXT NOT NULL,
  
  metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_trans_time_order CHECK (arrived_at >= departed_at),
  CONSTRAINT chk_trans_confidence CHECK (transition_confidence >= 0 AND transition_confidence <= 1),
  CONSTRAINT chk_trans_status CHECK (status IN ('CONFIRMED', 'PROBABLE', 'AMBIGUOUS', 'REJECTED'))
);

CREATE INDEX idx_transition_person_time 
ON person_transition (tenant_id, global_person_id, departed_at DESC);

CREATE INDEX idx_transition_camera_pair 
ON person_transition (tenant_id, from_camera_id, to_camera_id);

CREATE INDEX idx_transition_from_obs 
ON person_transition (from_observation_id);

CREATE INDEX idx_transition_to_obs 
ON person_transition (to_observation_id);

COMMENT ON TABLE person_transition IS 'Confidence-scored transitions between observations';

-- =====================================================
-- CAMERA TRANSITION RULE TABLE
-- Topology rules for feasibility checks
-- =====================================================
CREATE TABLE IF NOT EXISTS camera_transition_rule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  
  from_camera_id UUID NOT NULL,
  to_camera_id UUID NOT NULL,
  
  from_zone_id TEXT,
  to_zone_id TEXT,
  
  min_travel_seconds INTEGER NOT NULL,
  typical_travel_seconds INTEGER,
  max_travel_seconds INTEGER NOT NULL,
  
  probability NUMERIC(4,3), -- Historical probability
  
  bidirectional BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  
  metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_ct_travel_times CHECK (
    min_travel_seconds >= 0 AND
    max_travel_seconds >= min_travel_seconds AND
    (typical_travel_seconds IS NULL OR 
     (typical_travel_seconds >= min_travel_seconds AND typical_travel_seconds <= max_travel_seconds))
  ),
  CONSTRAINT chk_ct_probability_range CHECK (
    probability IS NULL OR (probability >= 0 AND probability <= 1)
  ),
  CONSTRAINT chk_ct_not_same_camera CHECK (from_camera_id != to_camera_id)
);

CREATE INDEX idx_camera_transition_from 
ON camera_transition_rule (tenant_id, from_camera_id)
WHERE enabled = true;

CREATE INDEX idx_camera_transition_to 
ON camera_transition_rule (tenant_id, to_camera_id)
WHERE enabled = true;

CREATE UNIQUE INDEX idx_camera_transition_unique 
ON camera_transition_rule (
  tenant_id, from_camera_id, to_camera_id,
  COALESCE(from_zone_id, ''), COALESCE(to_zone_id, '')
);

COMMENT ON TABLE camera_transition_rule IS 'Topology rules for camera-to-camera transitions';

-- =====================================================
-- EXTEND REID_EMBEDDINGS TABLE
-- Add journey-specific columns
-- =====================================================
DO $$ 
BEGIN
  -- Add columns if they don't exist
  ALTER TABLE reid_embeddings 
    ADD COLUMN IF NOT EXISTS observation_id UUID,
    ADD COLUMN IF NOT EXISTS model_name TEXT,
    ADD COLUMN IF NOT EXISTS model_version TEXT,
    ADD COLUMN IF NOT EXISTS dimensions INTEGER,
    ADD COLUMN IF NOT EXISTS quality_score NUMERIC(4,3);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_reid_observation 
ON reid_embeddings(observation_id)
WHERE observation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reid_model_version 
ON reid_embeddings(tenant_id, model_name, model_version);

COMMENT ON COLUMN reid_embeddings.observation_id IS 'Links embedding to person_observation';

-- =====================================================
-- PERSON JOURNEY SESSION TABLE (Optional)
-- Time-bounded journey groups
-- =====================================================
CREATE TABLE IF NOT EXISTS person_journey_session (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  tenant_id UUID NOT NULL,
  global_person_id TEXT NOT NULL,
  
  branch_id UUID,
  
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  
  observation_count INTEGER NOT NULL DEFAULT 0,
  transition_count INTEGER NOT NULL DEFAULT 0,
  
  overall_confidence NUMERIC(4,3) NOT NULL,
  
  metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_js_status CHECK (status IN ('ACTIVE', 'COMPLETED', 'TIMED_OUT')),
  CONSTRAINT chk_js_confidence CHECK (overall_confidence >= 0 AND overall_confidence <= 1),
  CONSTRAINT chk_js_time_order CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX idx_journey_session_person 
ON person_journey_session (tenant_id, global_person_id, started_at DESC);

CREATE INDEX idx_journey_session_active 
ON person_journey_session (tenant_id, global_person_id)
WHERE status = 'ACTIVE';

COMMENT ON TABLE person_journey_session IS 'Time-bounded journey sessions for grouping observations';

-- =====================================================
-- IDENTITY ASSOCIATION AUDIT TABLE (Optional)
-- Tracks identity assignment history for splits/merges
-- =====================================================
CREATE TABLE IF NOT EXISTS identity_association_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  observation_id UUID NOT NULL,
  global_person_id TEXT NOT NULL,
  
  confidence NUMERIC(4,3) NOT NULL,
  
  created_by TEXT NOT NULL, -- 'REID', 'TOPOLOGY', 'MANUAL', 'SYSTEM'
  created_by_user_id UUID,
  
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  
  reason TEXT,
  
  metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_ia_confidence CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT chk_ia_created_by CHECK (created_by IN ('REID', 'TOPOLOGY', 'MANUAL', 'SYSTEM'))
);

CREATE INDEX idx_identity_assoc_observation 
ON identity_association_audit (observation_id, valid_from DESC);

CREATE INDEX idx_identity_assoc_person 
ON identity_association_audit (global_person_id, valid_from DESC);

COMMENT ON TABLE identity_association_audit IS 'Audit trail for identity associations (supports splits/merges)';

-- =====================================================
-- GRANT PERMISSIONS (adjust as needed)
-- =====================================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_app_user;

-- =====================================================
-- INSERT SAMPLE DATA (Optional - for testing)
-- =====================================================
-- Uncomment to insert sample topology rules

/*
INSERT INTO camera_transition_rule (
  tenant_id, branch_id, from_camera_id, to_camera_id,
  min_travel_seconds, typical_travel_seconds, max_travel_seconds,
  bidirectional, enabled
) VALUES (
  'sample-tenant-uuid'::uuid,
  'sample-branch-uuid'::uuid,
  'entrance-camera-uuid'::uuid,
  'lobby-camera-uuid'::uuid,
  5, 15, 45,
  false, true
);
*/

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these to verify migration success:

-- Count tables created
SELECT 
  'global_person' as table_name, 
  COUNT(*) as row_count 
FROM global_person
UNION ALL
SELECT 
  'person_observation', 
  COUNT(*) 
FROM person_observation
UNION ALL
SELECT 
  'person_transition', 
  COUNT(*) 
FROM person_transition
UNION ALL
SELECT 
  'camera_transition_rule', 
  COUNT(*) 
FROM camera_transition_rule
UNION ALL
SELECT 
  'person_journey_session', 
  COUNT(*) 
FROM person_journey_session;

-- List all indexes
SELECT 
  tablename, 
  indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND (
    tablename LIKE '%person%' OR 
    tablename LIKE '%journey%' OR
    tablename LIKE '%transition%' OR
    tablename = 'reid_embeddings'
  )
ORDER BY tablename, indexname;
