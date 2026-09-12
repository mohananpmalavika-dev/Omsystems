-- Migration 131: Distributed High Availability and Disaster Recovery Verification
-- Control plane cluster consensus, backup manifests, and automated restoration verification drills.

CREATE TABLE IF NOT EXISTS cluster_nodes (
    id VARCHAR(64) PRIMARY KEY,
    node_type VARCHAR(32) NOT NULL, -- 'API', 'MEDIA_GATEWAY', 'WORKER'
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL,
    epoch BIGINT NOT NULL DEFAULT 1,
    is_leader BOOLEAN NOT NULL DEFAULT false,
    state VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'DRAINING', 'DEAD'
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cluster_nodes_heartbeat 
    ON cluster_nodes (node_type, state, heartbeat_at DESC);

CREATE TABLE IF NOT EXISTS dr_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_scope VARCHAR(32) NOT NULL DEFAULT 'CONTROL_PLANE_FULL',
    storage_uri VARCHAR(512) NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    manifest_signature TEXT NOT NULL,
    total_records INTEGER NOT NULL,
    rpo_seconds INTEGER NOT NULL, -- Observed data currency latency
    status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED', -- 'IN_PROGRESS', 'VERIFIED', 'CORRUPT'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dr_restore_drills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID NOT NULL REFERENCES dr_backups(id),
    drill_name VARCHAR(128) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    rto_seconds INTEGER NOT NULL, -- Recovery Time Objective measurement
    records_verified INTEGER NOT NULL,
    verification_status VARCHAR(32) NOT NULL, -- 'PASSED', 'FAILED'
    discrepancy_report JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dr_restore_status 
    ON dr_restore_drills (verification_status, created_at DESC);
