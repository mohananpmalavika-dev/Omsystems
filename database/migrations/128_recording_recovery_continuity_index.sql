-- Migration 128: Recording Engine Recovery, Continuity Ledgers, and Synchronized Playback
-- Enterprise banking recording continuity ledgers, crash recovery audit, and timeline alignment.

CREATE TABLE IF NOT EXISTS recording_continuity_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    camera_id VARCHAR(64) NOT NULL,
    window_type VARCHAR(16) NOT NULL, -- '24H', '7D', '30D'
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    expected_seconds INTEGER NOT NULL,
    recorded_seconds INTEGER NOT NULL,
    coverage_percent NUMERIC(5, 2) NOT NULL,
    gap_count INTEGER NOT NULL DEFAULT 0,
    largest_gap_seconds INTEGER NOT NULL DEFAULT 0,
    compliance_status VARCHAR(32) NOT NULL DEFAULT 'COMPLIANT', -- 'COMPLIANT', 'NON_COMPLIANT'
    sla_breached BOOLEAN NOT NULL DEFAULT false,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recording_continuity_camera_window 
    ON recording_continuity_ledgers (camera_id, window_type, window_start DESC);

CREATE INDEX IF NOT EXISTS idx_recording_continuity_tenant_sla 
    ON recording_continuity_ledgers (tenant_id, sla_breached, calculated_at DESC);

CREATE TABLE IF NOT EXISTS segment_recovery_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id VARCHAR(64) NOT NULL,
    camera_id VARCHAR(64) NOT NULL,
    recovery_action VARCHAR(64) NOT NULL, -- 'CONTAINER_REPAIRED', 'SEALED_WITH_PARTIAL', 'CORRUPT_QUARANTINED'
    recovered_bytes BIGINT NOT NULL,
    original_status VARCHAR(32) NOT NULL,
    final_status VARCHAR(32) NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    recovery_details JSONB,
    recovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segment_recovery_camera 
    ON segment_recovery_audit (camera_id, recovered_at DESC);
