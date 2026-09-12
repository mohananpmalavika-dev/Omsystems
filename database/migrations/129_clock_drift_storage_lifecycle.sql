-- Migration 129: Clock Integrity, NTP Drift, Retention Engine, and Storage Safety
-- Enterprise clock offset monitoring and predictive retention storage failure defenses.

CREATE TABLE IF NOT EXISTS clock_drift_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id VARCHAR(64) NOT NULL,
    node_type VARCHAR(32) NOT NULL, -- 'HO_SERVER', 'EDGE_GATEWAY', 'NVR', 'CAMERA'
    reference_source VARCHAR(64) NOT NULL DEFAULT 'NTP',
    offset_ms INTEGER NOT NULL,
    jitter_ms INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL, -- 'HEALTHY', 'WARNING', 'CRITICAL'
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clock_drift_node 
    ON clock_drift_telemetry (node_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS retention_quota_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64),
    camera_id VARCHAR(64),
    required_retention_days INTEGER NOT NULL DEFAULT 90, -- RBI banking mandate
    current_retention_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
    projected_retention_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLIANT', -- 'COMPLIANT', 'WARNING', 'CRITICAL'
    legal_hold BOOLEAN NOT NULL DEFAULT false,
    capacity_exhaustion_warning BOOLEAN NOT NULL DEFAULT false,
    last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retention_quota_tenant_cam 
    ON retention_quota_policies (tenant_id, camera_id);

CREATE TABLE IF NOT EXISTS storage_node_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id VARCHAR(64) NOT NULL UNIQUE,
    mount_point VARCHAR(255) NOT NULL,
    tier VARCHAR(16) NOT NULL DEFAULT 'HOT', -- 'HOT', 'WARM', 'ARCHIVE'
    state VARCHAR(32) NOT NULL DEFAULT 'HEALTHY', -- 'HEALTHY', 'WARM', 'ARCHIVE', 'FAILED', 'READ_ONLY', 'DRAINING'
    total_bytes BIGINT NOT NULL,
    used_bytes BIGINT NOT NULL,
    available_bytes BIGINT NOT NULL,
    write_latency_ms NUMERIC(10, 2) NOT NULL DEFAULT 2.5,
    io_errors_total INTEGER NOT NULL DEFAULT 0,
    smart_health VARCHAR(16) NOT NULL DEFAULT 'PASS', -- 'PASS', 'WARN', 'FAIL'
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storage_telemetry_state 
    ON storage_node_telemetry (state, tier);
