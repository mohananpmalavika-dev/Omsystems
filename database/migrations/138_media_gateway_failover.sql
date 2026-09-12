-- Migration 138: Automatic Media Gateway Failover & Stream Redirection (ha.media_failover)
-- Production tables for cluster node tracking, active stream routing, split-brain fencing, and failover audit history.

CREATE TABLE IF NOT EXISTS media_gateway_nodes (
    gateway_id VARCHAR(128) PRIMARY KEY,
    gateway_name VARCHAR(128) NOT NULL,
    ip_address VARCHAR(64) NOT NULL,
    port INT NOT NULL DEFAULT 8554,
    api_port INT NOT NULL DEFAULT 9997,
    public_url VARCHAR(255),
    region VARCHAR(64) NOT NULL DEFAULT 'default',
    status VARCHAR(32) NOT NULL DEFAULT 'HEALTHY', -- 'HEALTHY', 'DEGRADED', 'DRAINING', 'FAILED', 'OFFLINE'
    max_streams INT NOT NULL DEFAULT 250,
    active_streams INT NOT NULL DEFAULT 0,
    max_network_mbps DOUBLE PRECISION NOT NULL DEFAULT 1000.0,
    current_network_mbps DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    cpu_percent DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    memory_percent DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    consecutive_failures INT NOT NULL DEFAULT 0,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_gateway_status 
    ON media_gateway_nodes (status, active_streams);

CREATE INDEX IF NOT EXISTS idx_media_gateway_heartbeat 
    ON media_gateway_nodes (last_heartbeat_at DESC);

CREATE TABLE IF NOT EXISTS media_stream_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id VARCHAR(128) NOT NULL,
    stream_profile VARCHAR(32) NOT NULL DEFAULT 'main', -- 'main', 'sub', 'preview'
    assigned_gateway_id VARCHAR(128) NOT NULL REFERENCES media_gateway_nodes(gateway_id) ON DELETE CASCADE,
    standby_gateway_id VARCHAR(128) REFERENCES media_gateway_nodes(gateway_id) ON DELETE SET NULL,
    source_uri VARCHAR(512) NOT NULL,
    stream_path VARCHAR(255) NOT NULL,
    redirect_url VARCHAR(512) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'FAILOVER_IN_PROGRESS', 'FAILED_OVER', 'DEGRADED', 'OFFLINE'
    fencing_token BIGINT NOT NULL DEFAULT 1,
    viewer_count INT NOT NULL DEFAULT 0,
    bitrate_kbps INT NOT NULL DEFAULT 2048,
    fps INT NOT NULL DEFAULT 25,
    last_failover_at TIMESTAMPTZ,
    failover_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_camera_stream_profile UNIQUE (camera_id, stream_profile)
);

CREATE INDEX IF NOT EXISTS idx_media_stream_assigned_gw 
    ON media_stream_routes (assigned_gateway_id, status);

CREATE INDEX IF NOT EXISTS idx_media_stream_camera 
    ON media_stream_routes (camera_id);

CREATE TABLE IF NOT EXISTS media_gateway_failover_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(64) NOT NULL, -- 'FAILOVER_INITIATED', 'STREAM_REDIRECTED', 'FAILOVER_COMPLETED', 'FAILOVER_FAILED', 'GATEWAY_DRAINED', 'GATEWAY_RECOVERED', 'REBALANCE_COMPLETED'
    severity VARCHAR(32) NOT NULL DEFAULT 'INFO', -- 'INFO', 'WARNING', 'CRITICAL'
    failed_gateway_id VARCHAR(128) NOT NULL,
    target_gateway_id VARCHAR(128),
    affected_streams INT NOT NULL DEFAULT 0,
    redirected_streams INT NOT NULL DEFAULT 0,
    failed_redirects INT NOT NULL DEFAULT 0,
    rto_ms INT NOT NULL DEFAULT 0,
    reason VARCHAR(255) NOT NULL, -- 'HEARTBEAT_TIMEOUT', 'MANUAL_OPERATOR', 'DRAIN_MAINTENANCE', 'LOAD_REBALANCE'
    details JSONB,
    triggered_by VARCHAR(64) NOT NULL DEFAULT 'SYSTEM_WATCHDOG', -- 'SYSTEM_WATCHDOG', 'MANUAL_OPERATOR', 'MAINTENANCE'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_failover_events_gw 
    ON media_gateway_failover_events (failed_gateway_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_failover_events_created 
    ON media_gateway_failover_events (created_at DESC);

CREATE TABLE IF NOT EXISTS media_gateway_failover_policies (
    policy_id VARCHAR(64) PRIMARY KEY DEFAULT 'default',
    heartbeat_timeout_ms INT NOT NULL DEFAULT 5000,
    watchdog_interval_ms INT NOT NULL DEFAULT 2000,
    max_streams_per_gateway INT NOT NULL DEFAULT 250,
    max_load_percent INT NOT NULL DEFAULT 85,
    auto_failover_enabled BOOLEAN NOT NULL DEFAULT true,
    auto_failback_enabled BOOLEAN NOT NULL DEFAULT false,
    flap_damping_seconds INT NOT NULL DEFAULT 30,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial policy
INSERT INTO media_gateway_failover_policies (
    policy_id,
    heartbeat_timeout_ms,
    watchdog_interval_ms,
    max_streams_per_gateway,
    max_load_percent,
    auto_failover_enabled,
    auto_failback_enabled,
    flap_damping_seconds
) VALUES (
    'default',
    5000,
    2000,
    250,
    85,
    true,
    false,
    30
) ON CONFLICT (policy_id) DO NOTHING;
