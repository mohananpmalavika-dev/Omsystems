-- Migration 130: Edge Agent Lifecycle, Canary Deployments, and Signed Configuration Management
-- Enterprise edge fleet upgrades, health verification, and cryptographic drift detection.

CREATE TABLE IF NOT EXISTS edge_agent_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edge_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64),
    agent_version VARCHAR(32) NOT NULL,
    cpu_percent NUMERIC(5, 2) NOT NULL,
    ram_percent NUMERIC(5, 2) NOT NULL,
    disk_percent NUMERIC(5, 2) NOT NULL,
    uptime_seconds BIGINT NOT NULL,
    config_version INTEGER NOT NULL DEFAULT 1,
    cert_expiry TIMESTAMPTZ,
    last_restart_at TIMESTAMPTZ,
    upgrade_status VARCHAR(32) NOT NULL DEFAULT 'STABLE', -- 'STABLE', 'DOWNLOADING', 'VERIFYING', 'UPGRADING', 'HEALTH_CHECK', 'ROLLBACK', 'FAILED'
    ntp_status VARCHAR(16) NOT NULL DEFAULT 'HEALTHY',
    cameras_online INTEGER NOT NULL DEFAULT 0,
    cameras_total INTEGER NOT NULL DEFAULT 0,
    recorders_online INTEGER NOT NULL DEFAULT 0,
    recording_health VARCHAR(16) NOT NULL DEFAULT 'HEALTHY',
    internet_status VARCHAR(16) NOT NULL DEFAULT 'CONNECTED',
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edge_telemetry_heartbeat 
    ON edge_agent_telemetry (edge_id, heartbeat_at DESC);

CREATE TABLE IF NOT EXISTS edge_release_packages (
    id VARCHAR(64) PRIMARY KEY,
    version VARCHAR(32) NOT NULL UNIQUE,
    package_uri VARCHAR(512) NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    signature TEXT NOT NULL,
    min_compatible_version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    rollout_stage VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'CANARY_5', 'CANARY_25', 'CANARY_50', 'GENERAL_100', 'PAUSED', 'ROLLED_BACK'
    release_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edge_canary_rollouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id VARCHAR(64) NOT NULL REFERENCES edge_release_packages(id),
    current_stage VARCHAR(32) NOT NULL,
    total_eligible INTEGER NOT NULL DEFAULT 0,
    targeted_count INTEGER NOT NULL DEFAULT 0,
    healthy_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    rollback_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'COMPLETED', 'ROLLED_BACK'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edge_signed_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edge_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64),
    version INTEGER NOT NULL,
    payload JSONB NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    signature TEXT NOT NULL,
    signer_identity VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'DESIRED', -- 'DESIRED', 'APPLIED', 'DRIFTED', 'ROLLED_BACK'
    applied_version INTEGER,
    applied_at TIMESTAMPTZ,
    drift_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_edge_version UNIQUE (edge_id, version)
);

CREATE INDEX IF NOT EXISTS idx_signed_config_edge_version 
    ON edge_signed_configurations (edge_id, version DESC);
