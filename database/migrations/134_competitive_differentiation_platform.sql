-- 134_competitive_differentiation_platform.sql
-- Sprint Group D (Phases 31-36): Unified Access Control, Bank Event Correlation,
-- Multi-Site Federation & Store-and-Forward, SIEM / Webhook Platform, Threat-Level Automation.

CREATE TABLE IF NOT EXISTS access_control_doors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64) NOT NULL,
    door_code VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    location_type VARCHAR(64) NOT NULL DEFAULT 'DOOR', -- 'ENTRANCE', 'VAULT', 'SERVER_ROOM', 'CASH_CABIN'
    state VARCHAR(32) NOT NULL DEFAULT 'LOCKED', -- 'LOCKED', 'UNLOCKED', 'FORCED_OPEN', 'HELD_OPEN', 'FAULT'
    anti_passback_enabled BOOLEAN NOT NULL DEFAULT true,
    last_state_change TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_door_branch UNIQUE (tenant_id, branch_id, door_code)
);

CREATE TABLE IF NOT EXISTS door_camera_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    door_id UUID NOT NULL REFERENCES access_control_doors(id) ON DELETE CASCADE,
    camera_id VARCHAR(64) NOT NULL,
    direction VARCHAR(16) NOT NULL DEFAULT 'IN', -- 'IN', 'OUT', 'BOTH'
    pre_event_seconds INT NOT NULL DEFAULT 15,
    post_event_seconds INT NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_door_camera UNIQUE (door_id, camera_id, direction)
);

CREATE TABLE IF NOT EXISTS access_control_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64) NOT NULL,
    door_id UUID NOT NULL REFERENCES access_control_doors(id) ON DELETE CASCADE,
    credential_type VARCHAR(32) NOT NULL, -- 'BADGE', 'BIOMETRIC', 'PIN', 'REMOTE_OVERRIDE'
    badge_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128),
    user_name VARCHAR(128),
    direction VARCHAR(16) NOT NULL, -- 'ENTRY', 'EXIT'
    granted BOOLEAN NOT NULL,
    denial_reason VARCHAR(64), -- 'INVALID_BADGE', 'UNAUTHORIZED_ZONE', 'OUTSIDE_SCHEDULE', 'ANTI_PASSBACK'
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tailgating_suspected BOOLEAN NOT NULL DEFAULT false,
    evidence_clip_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS tailgating_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64) NOT NULL,
    door_id UUID NOT NULL REFERENCES access_control_doors(id),
    camera_id VARCHAR(64) NOT NULL,
    access_event_id UUID REFERENCES access_control_events(id),
    badges_granted_count INT NOT NULL DEFAULT 1,
    detected_persons_count INT NOT NULL,
    confidence NUMERIC(5, 4) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    incident_id UUID,
    status VARCHAR(32) NOT NULL DEFAULT 'DETECTED' -- 'DETECTED', 'CONFIRMED', 'FALSE_POSITIVE'
);

CREATE TABLE IF NOT EXISTS bank_correlation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    rule_code VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    category VARCHAR(64) NOT NULL, -- 'ATM_TAMPER', 'VAULT_INTRUSION', 'CASH_TRANSIT_LOITERING', 'CASH_VAN_SOP', 'AFTER_HOURS_STRONGROOM'
    severity VARCHAR(8) NOT NULL DEFAULT 'P1', -- 'P1', 'P2', 'P3', 'P4'
    enabled BOOLEAN NOT NULL DEFAULT true,
    condition_schema JSONB NOT NULL,
    action_schema JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bank_rule UNIQUE (tenant_id, rule_code)
);

CREATE TABLE IF NOT EXISTS bank_correlated_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64) NOT NULL,
    rule_id UUID NOT NULL REFERENCES bank_correlation_rules(id),
    severity VARCHAR(8) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    correlated_sources JSONB NOT NULL, -- list of cameraIds, sensorIds, accessEvents
    evidence_package_id UUID,
    incident_id UUID,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS federation_topology (
    site_id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    site_name VARCHAR(128) NOT NULL,
    tier VARCHAR(32) NOT NULL, -- 'EDGE_BRANCH', 'REGIONAL_HUB', 'HEAD_OFFICE'
    parent_site_id VARCHAR(64) REFERENCES federation_topology(site_id),
    connection_status VARCHAR(32) NOT NULL DEFAULT 'OFFLINE', -- 'ONLINE', 'DEGRADED', 'OFFLINE'
    endpoint_url VARCHAR(255) NOT NULL,
    last_sync_at TIMESTAMPTZ,
    backlog_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS federation_sync_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    site_id VARCHAR(64) NOT NULL REFERENCES federation_topology(site_id),
    entity_type VARCHAR(64) NOT NULL, -- 'INCIDENT', 'EVIDENCE_METADATA', 'AUDIT_RECORD', 'TELEMETRY'
    entity_id VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    synced BOOLEAN NOT NULL DEFAULT false,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS federation_policy_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    policy_name VARCHAR(128) NOT NULL,
    policy_version INT NOT NULL,
    policy_payload JSONB NOT NULL,
    target_tier VARCHAR(32) NOT NULL,
    target_site_id VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPLIED', 'FAILED'
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS siem_dispatch_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    target_type VARCHAR(32) NOT NULL, -- 'SPLUNK', 'QRADAR', 'SENTINEL', 'GENERIC_WEBHOOK'
    endpoint_url VARCHAR(255) NOT NULL,
    auth_secret VARCHAR(255) NOT NULL,
    format VARCHAR(16) NOT NULL DEFAULT 'JSON', -- 'JSON', 'CEF', 'SYSLOG_RFC5424'
    enabled BOOLEAN NOT NULL DEFAULT true,
    min_severity VARCHAR(8) NOT NULL DEFAULT 'P2',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS siem_dispatch_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id UUID NOT NULL REFERENCES siem_dispatch_targets(id) ON DELETE CASCADE,
    event_id VARCHAR(128) NOT NULL,
    attempt_number INT NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL, -- 'DELIVERED', 'FAILED', 'RETRYING'
    http_status INT,
    error_message TEXT,
    payload_hash VARCHAR(64) NOT NULL,
    signature VARCHAR(128) NOT NULL,
    dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS threat_posture_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64) NOT NULL,
    posture_level VARCHAR(16) NOT NULL, -- 'GREEN', 'AMBER', 'RED', 'BLACK'
    trigger_reason VARCHAR(128) NOT NULL,
    triggered_by_user_id VARCHAR(128),
    automated BOOLEAN NOT NULL DEFAULT true,
    source_incident_id UUID,
    active BOOLEAN NOT NULL DEFAULT true,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reverted_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS threat_posture_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    posture_id UUID NOT NULL REFERENCES threat_posture_ledgers(id) ON DELETE CASCADE,
    action_type VARCHAR(64) NOT NULL, -- 'BITRATE_BOOST', 'RETENTION_EXTENSION', 'WALL_DISPATCH', 'DOOR_LOCKDOWN', 'SIEM_BROADCAST'
    target_entity_id VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'EXECUTED', -- 'EXECUTED', 'FAILED', 'REVERTED'
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_access_events_branch_ts ON access_control_events(tenant_id, branch_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_correlated_events_branch_ts ON bank_correlated_events(tenant_id, branch_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_federation_sync_site ON federation_sync_outbox(site_id, synced) WHERE synced = false;
CREATE INDEX IF NOT EXISTS idx_threat_posture_active ON threat_posture_ledgers(tenant_id, branch_id, active);
