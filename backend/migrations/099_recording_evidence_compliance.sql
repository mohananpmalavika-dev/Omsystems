-- Recording Evidence and Compliance Architecture
-- 
-- This migration creates the database schema for the evidence-based
-- recording compliance system that properly separates:
-- 1. Evidence acquisition (what we observed)
-- 2. Policy definition (what is required)
-- 3. Compliance evaluation (does evidence satisfy policy)

-- ============================================================================
-- EVIDENCE TABLES
-- ============================================================================

-- Recording evidence snapshots
-- Stores raw evidence from recorder adapters
CREATE TABLE IF NOT EXISTS recording_evidence_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recorder_id UUID NOT NULL,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  
  -- Recording state from evidence
  recording_state TEXT NOT NULL CHECK (recording_state IN ('RECORDING', 'NOT_RECORDING', 'UNKNOWN')),
  latest_recording_at TIMESTAMPTZ,
  oldest_recording_at TIMESTAMPTZ,
  retention_days DECIMAL(10, 2),
  
  -- Storage evidence
  storage_status TEXT NOT NULL CHECK (storage_status IN ('HEALTHY', 'DEGRADED', 'FULL', 'UNKNOWN')),
  storage_total_bytes BIGINT,
  storage_used_bytes BIGINT,
  storage_free_bytes BIGINT,
  storage_usage_percent DECIMAL(5, 2),
  
  -- Verification metadata
  verification_status TEXT NOT NULL CHECK (verification_status IN ('VERIFIED', 'FAILED', 'UNKNOWN')),
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  source TEXT NOT NULL,
  method TEXT NOT NULL,
  confidence DECIMAL(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  latency_ms INTEGER,
  reason TEXT,
  
  -- Detailed checks (JSON)
  checks_json JSONB NOT NULL,
  coverage_json JSONB,
  details_json JSONB,
  
  -- Audit trail
  raw_payload_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT recording_evidence_snapshot_confidence_check CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX idx_recording_evidence_tenant_camera ON recording_evidence_snapshot(tenant_id, camera_id);
CREATE INDEX idx_recording_evidence_recorder ON recording_evidence_snapshot(recorder_id);
CREATE INDEX idx_recording_evidence_verification_status ON recording_evidence_snapshot(verification_status);
CREATE INDEX idx_recording_evidence_created_at ON recording_evidence_snapshot(created_at DESC);
CREATE INDEX idx_recording_evidence_expires_at ON recording_evidence_snapshot(expires_at);

-- Daily coverage summaries for efficient retention queries
CREATE TABLE IF NOT EXISTS recording_coverage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recorder_id UUID NOT NULL,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  
  expected_seconds INTEGER NOT NULL,
  recorded_seconds INTEGER NOT NULL,
  coverage_ratio DECIMAL(5, 4) NOT NULL CHECK (coverage_ratio >= 0 AND coverage_ratio <= 1),
  largest_gap_seconds INTEGER NOT NULL,
  
  verified_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  confidence DECIMAL(3, 2) NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one summary per camera per day
  UNIQUE (date, tenant_id, camera_id)
);

CREATE INDEX idx_coverage_daily_tenant_camera ON recording_coverage_daily(tenant_id, camera_id);
CREATE INDEX idx_coverage_daily_date ON recording_coverage_daily(date DESC);

-- ============================================================================
-- POLICY TABLES
-- ============================================================================

-- Recording retention policies
CREATE TABLE IF NOT EXISTS recording_retention_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Effective date range
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  
  -- Policy scope
  scope_branch_ids UUID[],
  scope_camera_ids UUID[],
  scope_camera_tags TEXT[],
  
  -- Recording requirements
  required_retention_days INTEGER NOT NULL CHECK (required_retention_days > 0),
  max_recording_gap_minutes INTEGER NOT NULL CHECK (max_recording_gap_minutes >= 0),
  require_continuous_recording BOOLEAN NOT NULL DEFAULT true,
  minimum_coverage_ratio DECIMAL(3, 2) CHECK (minimum_coverage_ratio >= 0 AND minimum_coverage_ratio <= 1),
  
  -- Evidence quality requirements
  minimum_evidence_confidence DECIMAL(3, 2) NOT NULL DEFAULT 0.7 CHECK (minimum_evidence_confidence >= 0 AND minimum_evidence_confidence <= 1),
  max_evidence_age_minutes INTEGER NOT NULL DEFAULT 15,
  minimum_evidence_level INTEGER,
  max_clock_drift_seconds INTEGER DEFAULT 300,
  
  -- Alerting
  alert_on_indeterminate BOOLEAN NOT NULL DEFAULT true,
  
  -- Enforcement level
  enforcement_level TEXT NOT NULL DEFAULT 'STANDARD' CHECK (enforcement_level IN ('STRICT', 'STANDARD', 'LENIENT')),
  
  -- Audit trail
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_retention_policy_tenant ON recording_retention_policy(tenant_id);
CREATE INDEX idx_retention_policy_effective ON recording_retention_policy(effective_from, effective_until);
CREATE INDEX idx_retention_policy_scope_branches ON recording_retention_policy USING GIN(scope_branch_ids);
CREATE INDEX idx_retention_policy_scope_cameras ON recording_retention_policy USING GIN(scope_camera_ids);

-- Policy version history
CREATE TABLE IF NOT EXISTS recording_retention_policy_history (
  LIKE recording_retention_policy INCLUDING ALL
);

CREATE INDEX idx_retention_policy_history_id_version ON recording_retention_policy_history(id, version DESC);

-- Policy change records
CREATE TABLE IF NOT EXISTS policy_change_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL,
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,
  changes JSONB NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT
);

CREATE INDEX idx_policy_change_policy_id ON policy_change_record(policy_id, changed_at DESC);

-- ============================================================================
-- COMPLIANCE FINDINGS TABLES
-- ============================================================================

-- Compliance evaluation findings
CREATE TABLE IF NOT EXISTS recording_compliance_finding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Policy reference
  policy_id UUID NOT NULL,
  policy_version INTEGER NOT NULL,
  policy_name TEXT,
  
  -- Resource reference
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  camera_name TEXT,
  recorder_id UUID NOT NULL,
  recorder_name TEXT,
  
  -- Compliance state
  state TEXT NOT NULL CHECK (state IN ('COMPLIANT', 'NON_COMPLIANT', 'INDETERMINATE', 'NOT_APPLICABLE')),
  reason TEXT,
  reason_code TEXT,
  
  -- Evaluation metadata
  evaluated_at TIMESTAMPTZ NOT NULL,
  
  -- Evidence reference
  evidence_snapshot_id UUID,
  evidence_status TEXT,
  evidence_verified_at TIMESTAMPTZ,
  evidence_age_seconds INTEGER,
  
  -- Requirements and observations (JSON)
  requirements_json JSONB NOT NULL,
  observed_json JSONB NOT NULL,
  violations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Scoring
  compliance_score INTEGER CHECK (compliance_score >= 0 AND compliance_score <= 100),
  
  -- Next evaluation
  next_evaluation_at TIMESTAMPTZ,
  
  -- Metadata
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_finding_tenant_camera ON recording_compliance_finding(tenant_id, camera_id);
CREATE INDEX idx_compliance_finding_policy ON recording_compliance_finding(policy_id);
CREATE INDEX idx_compliance_finding_state ON recording_compliance_finding(state);
CREATE INDEX idx_compliance_finding_evaluated_at ON recording_compliance_finding(evaluated_at DESC);
CREATE INDEX idx_compliance_finding_next_eval ON recording_compliance_finding(next_evaluation_at) WHERE next_evaluation_at IS NOT NULL;

-- Compliance audit records (immutable)
CREATE TABLE IF NOT EXISTS compliance_audit_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL,
  policy_version INTEGER NOT NULL,
  evidence_snapshot_id UUID,
  state TEXT NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL,
  evaluated_by TEXT,
  evidence_hash TEXT,
  finding_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_record_finding ON compliance_audit_record(finding_id, created_at DESC);
CREATE INDEX idx_audit_record_created_at ON compliance_audit_record(created_at DESC);

-- ============================================================================
-- FUNCTIONS AND VIEWS
-- ============================================================================

-- Function: Get recorder compliance summary
CREATE OR REPLACE FUNCTION get_recorder_compliance_summary(
  p_recorder_id UUID,
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  recorder_id UUID,
  total_checks BIGINT,
  healthy_checks BIGINT,
  unhealthy_checks BIGINT,
  unknown_checks BIGINT,
  healthy_percentage DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p_recorder_id,
    COUNT(*) as total_checks,
    COUNT(*) FILTER (WHERE verification_status = 'VERIFIED') as healthy_checks,
    COUNT(*) FILTER (WHERE verification_status = 'FAILED') as unhealthy_checks,
    COUNT(*) FILTER (WHERE verification_status = 'UNKNOWN') as unknown_checks,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        (COUNT(*) FILTER (WHERE verification_status = 'VERIFIED')::DECIMAL / COUNT(*)) * 100
      ELSE 0
    END as healthy_percentage
  FROM recording_evidence_snapshot
  WHERE recorder_id = p_recorder_id
    AND created_at >= NOW() - (p_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- View: Latest compliance findings by camera
CREATE OR REPLACE VIEW v_latest_compliance_findings AS
SELECT DISTINCT ON (camera_id)
  f.*
FROM recording_compliance_finding f
ORDER BY camera_id, evaluated_at DESC;

-- View: Cameras needing compliance evaluation
CREATE OR REPLACE VIEW v_cameras_needing_evaluation AS
SELECT 
  c.id as camera_id,
  c.branch_node_id as branch_id,
  b.tenant_id,
  COALESCE(f.next_evaluation_at, NOW() - INTERVAL '1 hour') as next_evaluation_at
FROM cameras c
JOIN resource_nodes b ON b.id = c.branch_node_id
LEFT JOIN LATERAL (
  SELECT next_evaluation_at
  FROM recording_compliance_finding
  WHERE camera_id = c.id
  ORDER BY evaluated_at DESC
  LIMIT 1
) f ON true
WHERE c.recording_enabled = true
  AND (f.next_evaluation_at IS NULL OR f.next_evaluation_at <= NOW());

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant permissions (adjust as needed for your roles)
-- GRANT SELECT, INSERT, UPDATE ON recording_evidence_snapshot TO app_user;
-- GRANT SELECT, INSERT ON recording_coverage_daily TO app_user;
-- GRANT SELECT ON recording_retention_policy TO app_user;
-- GRANT SELECT, INSERT ON recording_compliance_finding TO app_user;
-- GRANT SELECT ON compliance_audit_record TO app_user;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE recording_evidence_snapshot IS 'Evidence snapshots from recorder adapters - what we observed, not compliance evaluation';
COMMENT ON TABLE recording_coverage_daily IS 'Daily coverage summaries for efficient retention compliance queries';
COMMENT ON TABLE recording_retention_policy IS 'Recording retention and compliance policies with versioning';
COMMENT ON TABLE recording_compliance_finding IS 'Compliance evaluation results linking evidence to policy';
COMMENT ON TABLE compliance_audit_record IS 'Immutable audit trail of compliance evaluations';

COMMENT ON COLUMN recording_evidence_snapshot.recording_state IS 'RECORDING, NOT_RECORDING, or UNKNOWN - never assume recording if cannot verify';
COMMENT ON COLUMN recording_evidence_snapshot.confidence IS 'Evidence confidence 0.0-1.0 based on verification method';
COMMENT ON COLUMN recording_evidence_snapshot.raw_payload_hash IS 'SHA-256 hash of raw adapter response for audit trail';

COMMENT ON COLUMN recording_retention_policy.version IS 'Policy version incremented on each update for audit trail';
COMMENT ON COLUMN recording_retention_policy.minimum_evidence_confidence IS 'Minimum confidence required to evaluate compliance';
COMMENT ON COLUMN recording_retention_policy.enforcement_level IS 'STRICT = any violation fails, STANDARD = critical only, LENIENT = warnings only';

COMMENT ON COLUMN recording_compliance_finding.state IS 'COMPLIANT, NON_COMPLIANT, INDETERMINATE (cannot verify), or NOT_APPLICABLE';
COMMENT ON COLUMN recording_compliance_finding.evidence_snapshot_id IS 'Links to specific evidence snapshot used for evaluation';
COMMENT ON COLUMN recording_compliance_finding.compliance_score IS 'Numeric score 0-100 for trend analysis';
