-- Migration: Security Evidence Tables
-- Version: 001
-- Description: Creates tables for security evidence persistence and state transitions
-- 
-- This migration supports the provenance-based security evidence system
-- that ensures missing evidence never converts to "healthy" status.

-- ============================================================================
-- Security Control Evidence Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_control_evidence (
  -- Primary identification
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  branch_id TEXT,
  device_id TEXT,
  control_type TEXT NOT NULL,
  
  -- Evidence state (enforced by CHECK constraints)
  state TEXT NOT NULL CHECK (state IN ('HEALTHY', 'UNHEALTHY', 'UNKNOWN')),
  available BOOLEAN NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('LIVE', 'SIMULATED', 'UNAVAILABLE')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT NOT NULL,
  
  -- Timestamps
  observed_at TIMESTAMP,  -- When the evidence was observed (null for UNKNOWN)
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Evidence payload (JSON string, null for UNKNOWN)
  evidence_json TEXT,
  
  -- Collector metadata
  collector_id TEXT NOT NULL,
  collector_version TEXT NOT NULL,
  
  -- Correlation for incident investigation
  correlation_id TEXT,
  
  -- Additional metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_evidence_tenant_control 
  ON security_control_evidence(tenant_id, control_type, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_device 
  ON security_control_evidence(tenant_id, device_id, control_type, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_state 
  ON security_control_evidence(tenant_id, state, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_source 
  ON security_control_evidence(tenant_id, source, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_observed_at 
  ON security_control_evidence(observed_at DESC) 
  WHERE observed_at IS NOT NULL;

-- Index for current state queries (most recent per control)
CREATE INDEX IF NOT EXISTS idx_evidence_current_state 
  ON security_control_evidence(tenant_id, control_type, device_id, received_at DESC);

-- ============================================================================
-- Security State Transitions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_control_transition (
  -- Primary identification
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  device_id TEXT,
  control_type TEXT NOT NULL,
  
  -- Transition details
  previous_state TEXT NOT NULL CHECK (previous_state IN ('HEALTHY', 'UNHEALTHY', 'UNKNOWN')),
  new_state TEXT NOT NULL CHECK (new_state IN ('HEALTHY', 'UNHEALTHY', 'UNKNOWN')),
  previous_reason TEXT,
  new_reason TEXT NOT NULL,
  
  -- Timing
  transitioned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Link to evidence
  evidence_id TEXT NOT NULL,
  
  -- Classification of transition type
  transition_type TEXT NOT NULL CHECK (transition_type IN (
    'improvement',           -- UNKNOWN/UNHEALTHY → HEALTHY
    'degradation',          -- HEALTHY → UNHEALTHY
    'telemetry_loss',       -- HEALTHY → UNKNOWN
    'telemetry_recovery',   -- UNKNOWN → HEALTHY
    'investigation'         -- UNKNOWN → UNHEALTHY (newly discovered failure)
  )),
  
  -- Additional metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key to evidence table
  FOREIGN KEY (evidence_id) REFERENCES security_control_evidence(id) ON DELETE CASCADE
);

-- Indexes for transition queries
CREATE INDEX IF NOT EXISTS idx_transition_tenant 
  ON security_control_transition(tenant_id, transitioned_at DESC);

CREATE INDEX IF NOT EXISTS idx_transition_control 
  ON security_control_transition(tenant_id, control_type, transitioned_at DESC);

CREATE INDEX IF NOT EXISTS idx_transition_device 
  ON security_control_transition(tenant_id, device_id, transitioned_at DESC);

CREATE INDEX IF NOT EXISTS idx_transition_type 
  ON security_control_transition(tenant_id, transition_type, transitioned_at DESC);

CREATE INDEX IF NOT EXISTS idx_transition_evidence 
  ON security_control_transition(evidence_id);

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Current state view: Most recent evidence for each control
CREATE VIEW IF NOT EXISTS v_security_current_state AS
SELECT DISTINCT ON (tenant_id, COALESCE(device_id, ''), control_type)
  id,
  tenant_id,
  branch_id,
  device_id,
  control_type,
  state,
  available,
  source,
  confidence,
  reason,
  observed_at,
  received_at,
  evidence_json,
  collector_id,
  collector_version
FROM security_control_evidence
ORDER BY tenant_id, COALESCE(device_id, ''), control_type, received_at DESC;

-- Evidence freshness view: Identify stale or missing evidence
CREATE VIEW IF NOT EXISTS v_security_evidence_freshness AS
SELECT 
  tenant_id,
  device_id,
  control_type,
  state,
  source,
  observed_at,
  received_at,
  CASE
    WHEN observed_at IS NULL THEN 'never_observed'
    WHEN JULIANDAY('now') - JULIANDAY(observed_at) < 1.0 THEN 'fresh'
    WHEN JULIANDAY('now') - JULIANDAY(observed_at) < 7.0 THEN 'stale'
    ELSE 'expired'
  END as freshness,
  CAST((JULIANDAY('now') - JULIANDAY(observed_at)) * 24 * 60 AS INTEGER) as age_minutes
FROM security_control_evidence
WHERE id IN (
  SELECT DISTINCT ON (tenant_id, COALESCE(device_id, ''), control_type) id
  FROM security_control_evidence
  ORDER BY tenant_id, COALESCE(device_id, ''), control_type, received_at DESC
);

-- Transition summary view: Count transitions by type
CREATE VIEW IF NOT EXISTS v_security_transition_summary AS
SELECT 
  tenant_id,
  control_type,
  transition_type,
  COUNT(*) as transition_count,
  MAX(transitioned_at) as last_transition_at
FROM security_control_transition
WHERE transitioned_at > DATETIME('now', '-30 days')
GROUP BY tenant_id, control_type, transition_type;

-- ============================================================================
-- Security Constraints
-- ============================================================================

-- Ensure HEALTHY state has required fields
-- Note: SQLite doesn't support complex CHECK constraints referencing multiple columns
-- This should be enforced at the application level using TypeScript types

-- ============================================================================
-- Comments and Documentation
-- ============================================================================

-- Control Types:
--   - secure_boot: UEFI Secure Boot and TPM attestation
--   - ransomware_protection: EDR agent and protection status
--   - tamper_protection: Tamper detection sensor status
--   - tamper_condition: Actual tamper event detection

-- State Semantics:
--   - HEALTHY: Live evidence showing control is verified and working
--   - UNHEALTHY: Live evidence showing control failure
--   - UNKNOWN: No evidence, stale evidence, or unavailable collector

-- Source Semantics:
--   - LIVE: Real-time data from production systems (production-trusted)
--   - SIMULATED: Mock/test data (NEVER production-trusted)
--   - UNAVAILABLE: Collector not configured or unreachable

-- Reason Codes:
--   - VERIFIED: Successfully verified healthy
--   - CONTROL_FAILED: Active security control failure
--   - COLLECTOR_UNAVAILABLE: Collector service not running
--   - NOT_SUPPORTED: Platform doesn't support this control
--   - NOT_CONFIGURED: Control exists but not configured
--   - STALE_EVIDENCE: Evidence too old to trust
--   - SIMULATED_DATA: Using simulated data
--   - PERMISSION_DENIED: Insufficient permissions
--   - TIMEOUT: Collection timed out
--   - INVALID_RESPONSE: Malformed data received
--   - NO_EVIDENCE: No evidence available

-- ============================================================================
-- Migration Complete
-- ============================================================================
