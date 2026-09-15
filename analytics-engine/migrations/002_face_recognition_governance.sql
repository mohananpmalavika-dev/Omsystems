-- ============================================================================
-- Face Recognition & BFSI Governance Schema
-- ============================================================================
-- Creates tables for face watchlists, persons, embeddings, events, reviews,
-- consent management, and governance audit trails
--
-- Version: 2.0.0
-- Created: 2026-09-15
-- ============================================================================

-- Enable pgvector extension for face embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Face Watchlists
-- ============================================================================

CREATE TABLE IF NOT EXISTS face_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  list_type VARCHAR(50) NOT NULL DEFAULT 'security',
  enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Alert configuration
  alert_on_match BOOLEAN NOT NULL DEFAULT true,
  alert_severity VARCHAR(10) NOT NULL DEFAULT 'P2',
  
  -- Matching thresholds
  match_threshold DECIMAL(4,3) NOT NULL DEFAULT 0.70,
  review_threshold DECIMAL(4,3) NOT NULL DEFAULT 0.60,
  minimum_margin DECIMAL(4,3) NOT NULL DEFAULT 0.05,
  minimum_quality DECIMAL(4,3) NOT NULL DEFAULT 0.55,
  
  -- Temporal confirmation (BFSI compliance)
  temporal_confirmation_frames INTEGER NOT NULL DEFAULT 3,
  temporal_window_seconds INTEGER NOT NULL DEFAULT 2,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  created_by VARCHAR(100),
  
  -- Constraints
  CONSTRAINT face_watchlists_tenant_name UNIQUE (tenant_id, name, archived_at),
  CONSTRAINT face_watchlists_type_check CHECK (list_type IN ('security', 'vip', 'staff', 'blacklist', 'missing-person')),
  CONSTRAINT face_watchlists_severity_check CHECK (alert_severity IN ('P1', 'P2', 'P3', 'P4', 'P5')),
  CONSTRAINT face_watchlists_thresholds_check CHECK (
    match_threshold >= 0.40 AND match_threshold <= 0.95 AND
    review_threshold >= 0.40 AND review_threshold <= 0.95 AND
    minimum_margin >= 0.01 AND minimum_margin <= 0.30 AND
    minimum_quality >= 0.30 AND minimum_quality <= 0.95
  )
);

CREATE INDEX idx_face_watchlists_tenant ON face_watchlists(tenant_id) WHERE archived_at IS NULL;
CREATE INDEX idx_face_watchlists_type ON face_watchlists(tenant_id, list_type) WHERE archived_at IS NULL;

-- ============================================================================
-- Face Watchlist Persons
-- ============================================================================

CREATE TABLE IF NOT EXISTS face_watchlist_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  watchlist_id UUID NOT NULL REFERENCES face_watchlists(id) ON DELETE CASCADE,
  external_id VARCHAR(100),
  
  -- Person details
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(20),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Statistics
  match_count INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  
  -- Metadata
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  enrolled_by VARCHAR(100),
  
  -- Constraints
  CONSTRAINT face_persons_watchlist FOREIGN KEY (watchlist_id) REFERENCES face_watchlists(id),
  CONSTRAINT face_persons_gender_check CHECK (gender IN ('male', 'female', 'other', 'unknown'))
);

CREATE INDEX idx_face_persons_watchlist ON face_watchlist_persons(watchlist_id) WHERE archived_at IS NULL;
CREATE INDEX idx_face_persons_tenant ON face_watchlist_persons(tenant_id) WHERE archived_at IS NULL;
CREATE INDEX idx_face_persons_external_id ON face_watchlist_persons(tenant_id, external_id) WHERE archived_at IS NULL;
CREATE INDEX idx_face_persons_last_seen ON face_watchlist_persons(last_seen_at DESC) WHERE archived_at IS NULL;

-- ============================================================================
-- Face Embeddings (512-dimensional vectors)
-- ============================================================================

CREATE TABLE IF NOT EXISTS face_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  person_id UUID NOT NULL REFERENCES face_watchlist_persons(id) ON DELETE CASCADE,
  
  -- 512-dimensional face embedding (ArcFace R100)
  embedding vector(512) NOT NULL,
  
  -- Quality metrics
  quality_score DECIMAL(4,3),
  liveness_score DECIMAL(4,3),
  
  -- Model metadata
  model_name VARCHAR(100) NOT NULL,
  model_version VARCHAR(50) NOT NULL,
  
  -- Source metadata
  source_image_reference TEXT,
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_face_embeddings_person ON face_embeddings(person_id);
CREATE INDEX idx_face_embeddings_tenant ON face_embeddings(tenant_id);

-- Create HNSW index for fast vector similarity search (pgvector)
-- Using cosine distance for face embeddings
CREATE INDEX idx_face_embeddings_vector ON face_embeddings 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- Face Recognition Events
-- ============================================================================

CREATE TABLE IF NOT EXISTS face_recognition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  camera_id UUID NOT NULL,
  watchlist_id UUID REFERENCES face_watchlists(id),
  person_id UUID REFERENCES face_watchlist_persons(id),
  
  -- Match details
  similarity_score DECIMAL(5,4) NOT NULL,
  face_bbox JSONB NOT NULL,
  face_quality DECIMAL(4,3),
  
  -- Attributes
  age_estimate INTEGER,
  gender_estimate VARCHAR(20),
  wearing_mask BOOLEAN,
  
  -- Evidence
  snapshot_reference TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  
  -- Review status (derived from face_match_reviews)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT face_events_similarity_check CHECK (similarity_score >= 0 AND similarity_score <= 1),
  CONSTRAINT face_events_quality_check CHECK (face_quality IS NULL OR (face_quality >= 0 AND face_quality <= 1)),
  CONSTRAINT face_events_age_check CHECK (age_estimate IS NULL OR (age_estimate >= 0 AND age_estimate <= 150)),
  CONSTRAINT face_events_gender_check CHECK (gender_estimate IS NULL OR gender_estimate IN ('male', 'female'))
);

CREATE INDEX idx_face_events_tenant ON face_recognition_events(tenant_id);
CREATE INDEX idx_face_events_camera ON face_recognition_events(camera_id, occurred_at DESC);
CREATE INDEX idx_face_events_watchlist ON face_recognition_events(watchlist_id, occurred_at DESC);
CREATE INDEX idx_face_events_person ON face_recognition_events(person_id, occurred_at DESC);
CREATE INDEX idx_face_events_occurred_at ON face_recognition_events(occurred_at DESC);

-- ============================================================================
-- Face Match Reviews (Human-in-the-loop)
-- ============================================================================

CREATE TABLE IF NOT EXISTS face_match_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  recognition_event_id UUID NOT NULL REFERENCES face_recognition_events(id) ON DELETE CASCADE,
  reviewer_id VARCHAR(100) NOT NULL,
  
  -- Review decision
  decision VARCHAR(20) NOT NULL,
  notes TEXT,
  
  -- Metadata
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT face_reviews_event UNIQUE (recognition_event_id),
  CONSTRAINT face_reviews_decision_check CHECK (decision IN ('confirmed', 'rejected', 'unsure'))
);

CREATE INDEX idx_face_reviews_tenant ON face_match_reviews(tenant_id);
CREATE INDEX idx_face_reviews_event ON face_match_reviews(recognition_event_id);
CREATE INDEX idx_face_reviews_decision ON face_match_reviews(tenant_id, decision);

-- ============================================================================
-- Biometric Consent Management (BFSI Compliance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS face_biometric_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  person_id UUID NOT NULL,
  person_name VARCHAR(255) NOT NULL,
  
  -- Consent details
  role VARCHAR(50) NOT NULL,
  consent_signed_at TIMESTAMPTZ NOT NULL,
  consent_expiry_at TIMESTAMPTZ NOT NULL,
  document_reference VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  
  -- Constraints
  CONSTRAINT face_consent_tenant_person UNIQUE (tenant_id, person_id),
  CONSTRAINT face_consent_role_check CHECK (role IN ('EMPLOYEE', 'CUSTOMER', 'VENDOR', 'SECURITY_STAFF')),
  CONSTRAINT face_consent_status_check CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  CONSTRAINT face_consent_dates_check CHECK (consent_expiry_at > consent_signed_at)
);

CREATE INDEX idx_face_consent_tenant ON face_biometric_consent(tenant_id);
CREATE INDEX idx_face_consent_person ON face_biometric_consent(person_id);
CREATE INDEX idx_face_consent_status ON face_biometric_consent(tenant_id, status);
CREATE INDEX idx_face_consent_expiry ON face_biometric_consent(consent_expiry_at) WHERE status = 'ACTIVE';

-- ============================================================================
-- Governance Audit Trail (BFSI Compliance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS face_governance_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  camera_id UUID NOT NULL,
  branch_id VARCHAR(100),
  person_id UUID,
  
  -- Validation result
  validation_result VARCHAR(20) NOT NULL,
  rejection_reason TEXT,
  
  -- Biometric quality metrics
  liveness_score DECIMAL(4,3),
  quality_score DECIMAL(4,3),
  observation_count INTEGER,
  
  -- Timestamp
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT face_audit_result_check CHECK (validation_result IN ('ACCEPTED', 'REJECTED', 'PENDING_REVIEW'))
);

CREATE INDEX idx_face_audit_tenant ON face_governance_audit(tenant_id, occurred_at DESC);
CREATE INDEX idx_face_audit_camera ON face_governance_audit(camera_id, occurred_at DESC);
CREATE INDEX idx_face_audit_branch ON face_governance_audit(branch_id, occurred_at DESC);
CREATE INDEX idx_face_audit_person ON face_governance_audit(person_id, occurred_at DESC);
CREATE INDEX idx_face_audit_result ON face_governance_audit(validation_result, occurred_at DESC);

-- ============================================================================
-- Camera Accuracy Audit (False Positive Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS face_camera_accuracy_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  camera_id UUID NOT NULL,
  branch_id VARCHAR(100),
  
  -- Period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Statistics
  total_observations INTEGER NOT NULL DEFAULT 0,
  genuine_matches INTEGER NOT NULL DEFAULT 0,
  false_positives INTEGER NOT NULL DEFAULT 0,
  false_positive_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
  liveness_rejections INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT face_accuracy_tenant_camera_period UNIQUE (tenant_id, camera_id, period_start),
  CONSTRAINT face_accuracy_dates_check CHECK (period_end >= period_start),
  CONSTRAINT face_accuracy_stats_check CHECK (
    total_observations >= 0 AND
    genuine_matches >= 0 AND
    false_positives >= 0 AND
    genuine_matches + false_positives <= total_observations AND
    false_positive_rate >= 0 AND false_positive_rate <= 1
  )
);

CREATE INDEX idx_face_accuracy_tenant ON face_camera_accuracy_audit(tenant_id);
CREATE INDEX idx_face_accuracy_camera ON face_camera_accuracy_audit(camera_id, period_start DESC);
CREATE INDEX idx_face_accuracy_branch ON face_camera_accuracy_audit(branch_id, period_start DESC);
CREATE INDEX idx_face_accuracy_fpr ON face_camera_accuracy_audit(false_positive_rate DESC);

-- ============================================================================
-- Functions & Triggers
-- ============================================================================

-- Update watchlist updated_at timestamp
CREATE OR REPLACE FUNCTION update_face_watchlist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_face_watchlist_updated_at
  BEFORE UPDATE ON face_watchlists
  FOR EACH ROW
  EXECUTE FUNCTION update_face_watchlist_updated_at();

-- Update consent updated_at timestamp
CREATE OR REPLACE FUNCTION update_face_consent_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_face_consent_updated_at
  BEFORE UPDATE ON face_biometric_consent
  FOR EACH ROW
  EXECUTE FUNCTION update_face_consent_updated_at();

-- ============================================================================
-- Views for Reporting
-- ============================================================================

-- Active watchlist summary
CREATE OR REPLACE VIEW vw_face_watchlist_summary AS
SELECT 
  w.id,
  w.tenant_id,
  w.name,
  w.list_type,
  w.enabled,
  w.alert_on_match,
  w.alert_severity,
  COUNT(DISTINCT p.id) FILTER (WHERE p.archived_at IS NULL) as person_count,
  COUNT(DISTINCT e.id) as embedding_count,
  MAX(p.last_seen_at) as last_match_at,
  w.created_at,
  w.updated_at
FROM face_watchlists w
LEFT JOIN face_watchlist_persons p ON p.watchlist_id = w.id AND p.archived_at IS NULL
LEFT JOIN face_embeddings e ON e.person_id = p.id
WHERE w.archived_at IS NULL
GROUP BY w.id;

-- Consent expiry monitoring
CREATE OR REPLACE VIEW vw_face_consent_expiring_soon AS
SELECT 
  c.*,
  (c.consent_expiry_at - NOW()) as time_until_expiry
FROM face_biometric_consent c
WHERE c.status = 'ACTIVE'
  AND c.consent_expiry_at > NOW()
  AND c.consent_expiry_at < NOW() + INTERVAL '30 days'
ORDER BY c.consent_expiry_at ASC;

-- Governance audit summary by camera
CREATE OR REPLACE VIEW vw_face_governance_audit_by_camera AS
SELECT 
  camera_id,
  branch_id,
  DATE_TRUNC('day', occurred_at) as audit_date,
  COUNT(*) as total_validations,
  COUNT(*) FILTER (WHERE validation_result = 'ACCEPTED') as accepted_count,
  COUNT(*) FILTER (WHERE validation_result = 'REJECTED') as rejected_count,
  COUNT(*) FILTER (WHERE rejection_reason LIKE '%LIVENESS%') as liveness_rejections,
  COUNT(*) FILTER (WHERE rejection_reason LIKE '%TEMPORAL%') as temporal_rejections,
  COUNT(*) FILTER (WHERE rejection_reason LIKE '%CONSENT%') as consent_rejections,
  AVG(liveness_score) FILTER (WHERE liveness_score IS NOT NULL) as avg_liveness_score,
  AVG(observation_count) FILTER (WHERE observation_count IS NOT NULL) as avg_observation_count
FROM face_governance_audit
GROUP BY camera_id, branch_id, DATE_TRUNC('day', occurred_at)
ORDER BY audit_date DESC, camera_id;

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Additional composite indexes for common queries
CREATE INDEX idx_face_events_camera_person ON face_recognition_events(camera_id, person_id, occurred_at DESC);
CREATE INDEX idx_face_embeddings_quality ON face_embeddings(tenant_id, quality_score DESC) WHERE quality_score IS NOT NULL;
CREATE INDEX idx_face_consent_active ON face_biometric_consent(tenant_id, person_id) WHERE status = 'ACTIVE';

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE face_watchlists IS 'Face recognition watchlists (security, VIP, staff, blacklist, missing-person)';
COMMENT ON TABLE face_watchlist_persons IS 'Enrolled persons in watchlists with biographic details';
COMMENT ON TABLE face_embeddings IS '512-dimensional face embeddings from ArcFace R100 model';
COMMENT ON TABLE face_recognition_events IS 'Face recognition events from live camera streams';
COMMENT ON TABLE face_match_reviews IS 'Human review decisions for face matches (BFSI compliance)';
COMMENT ON TABLE face_biometric_consent IS 'Biometric consent records per RBI guidelines';
COMMENT ON TABLE face_governance_audit IS 'Audit trail of governance validation decisions';
COMMENT ON TABLE face_camera_accuracy_audit IS 'Per-camera false positive rate tracking';

COMMENT ON COLUMN face_embeddings.embedding IS '512-dimensional face embedding vector (pgvector)';
COMMENT ON COLUMN face_watchlists.temporal_confirmation_frames IS 'Minimum frames required before alerting (BFSI: >=3)';
COMMENT ON COLUMN face_biometric_consent.document_reference IS 'Reference to signed consent document (PDF, HRMS record)';
COMMENT ON INDEX idx_face_embeddings_vector IS 'HNSW index for fast cosine similarity search';

-- ============================================================================
-- Initial Data (Optional)
-- ============================================================================

-- Create default security watchlist for demo purposes (commented out for production)
-- INSERT INTO face_watchlists (tenant_id, name, description, list_type, enabled, created_by)
-- VALUES (
--   '00000000-0000-0000-0000-000000000000',
--   'Security Watchlist',
--   'Default security watchlist for threat detection',
--   'security',
--   true,
--   'system'
-- ) ON CONFLICT DO NOTHING;

-- ============================================================================
-- End of Migration
-- ============================================================================
