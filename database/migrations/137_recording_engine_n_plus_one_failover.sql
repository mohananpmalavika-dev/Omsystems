-- Migration 137: Recording Engine N+1 Failover Schema
-- Enterprise-grade high-availability recording node cluster, distributed stream ingest assignments,
-- fencing tokens (epochs) for split-brain prevention, and failover audit logging.

-- 1. recording_nodes: Tracks active and standby recording engine instances
CREATE TABLE IF NOT EXISTS recording_nodes (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 8085,
    role VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'STANDBY', 'DRAINING', 'MAINTENANCE'
    state VARCHAR(32) NOT NULL DEFAULT 'HEALTHY', -- 'HEALTHY', 'DEGRADED', 'HEARTBEAT_EXPIRED', 'OFFLINE', 'FAILOVER_ACTIVE'
    current_epoch BIGINT NOT NULL DEFAULT 1,
    max_stream_capacity INTEGER NOT NULL DEFAULT 128,
    active_stream_count INTEGER NOT NULL DEFAULT 0,
    cpu_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    memory_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    disk_write_mbps NUMERIC(8, 2) NOT NULL DEFAULT 0.0,
    network_in_mbps NUMERIC(8, 2) NOT NULL DEFAULT 0.0,
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recording_nodes_role_state
    ON recording_nodes (role, state, heartbeat_at DESC);

-- 2. recording_node_assignments: Maps cameras/streams to active and standby recording nodes
CREATE TABLE IF NOT EXISTS recording_node_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id UUID NOT NULL,
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    primary_node_id VARCHAR(64) NOT NULL REFERENCES recording_nodes(id) ON DELETE CASCADE,
    current_node_id VARCHAR(64) NOT NULL REFERENCES recording_nodes(id) ON DELETE CASCADE,
    stream_uri TEXT NOT NULL,
    stream_profile VARCHAR(32) NOT NULL DEFAULT 'main',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'FAILED_OVER', 'DRAINING', 'STOPPED'
    takeover_epoch BIGINT NOT NULL DEFAULT 1,
    failed_over_at TIMESTAMPTZ,
    last_gap_logged_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_recording_assignment_camera UNIQUE (camera_id)
);

CREATE INDEX IF NOT EXISTS idx_recording_node_assignments_current
    ON recording_node_assignments (current_node_id, status);

CREATE INDEX IF NOT EXISTS idx_recording_node_assignments_primary
    ON recording_node_assignments (primary_node_id, status);

-- 3. recording_failover_events: Full audit history for SLA, RTO, and forensic investigation
CREATE TABLE IF NOT EXISTS recording_failover_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    failed_node_id VARCHAR(64) NOT NULL,
    standby_node_id VARCHAR(64) NOT NULL,
    affected_cameras INTEGER NOT NULL DEFAULT 0,
    transferred_cameras INTEGER NOT NULL DEFAULT 0,
    detection_time_ms INTEGER NOT NULL DEFAULT 0,
    takeover_time_ms INTEGER NOT NULL DEFAULT 0,
    total_rto_ms INTEGER NOT NULL DEFAULT 0,
    reason VARCHAR(64) NOT NULL DEFAULT 'HEARTBEAT_EXPIRED', -- 'HEARTBEAT_EXPIRED', 'NODE_CRASH', 'MANUAL_FAILOVER', 'NETWORK_PARTITION', 'HIGH_ERROR_RATE'
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED', -- 'TRIGGERED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'RECOVERED'
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recovered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recording_failover_events_nodes
    ON recording_failover_events (failed_node_id, standby_node_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recording_failover_events_status
    ON recording_failover_events (status, created_at DESC);
