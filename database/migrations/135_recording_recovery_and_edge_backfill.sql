-- Migration 135: Recording Gap Recovery & Edge Backfill (recording.recovery)
-- Production tables, indexes, and schema enhancements for automated edge-to-cloud backfill
-- and zero-duplicate frame recording recovery following network/WAN isolation.

-- 1. Ensure recording_gaps has complete columns for recovery & backfill tracking
CREATE TABLE IF NOT EXISTS recording_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000',
    branch_id VARCHAR(64),
    camera_id VARCHAR(64) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    gap_duration_seconds INTEGER,
    reason VARCHAR(64) NOT NULL DEFAULT 'NETWORK_DISCONNECTION',
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'IN_PROGRESS', 'HEALED', 'UNRECOVERABLE'
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    healed_at TIMESTAMPTZ,
    healed_by VARCHAR(64) DEFAULT 'EDGE_BACKFILL',
    backfill_job_id UUID,
    segments_recovered_count INTEGER NOT NULL DEFAULT 0,
    bytes_recovered BIGINT NOT NULL DEFAULT 0,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

ALTER TABLE recording_gaps
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    ADD COLUMN IF NOT EXISTS healed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS healed_by VARCHAR(64) DEFAULT 'EDGE_BACKFILL',
    ADD COLUMN IF NOT EXISTS backfill_job_id UUID,
    ADD COLUMN IF NOT EXISTS segments_recovered_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bytes_recovered BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gap_duration_seconds INTEGER;

CREATE INDEX IF NOT EXISTS idx_recording_gaps_status 
    ON recording_gaps (status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_recording_gaps_camera_status 
    ON recording_gaps (camera_id, status, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_recording_gaps_branch_status 
    ON recording_gaps (branch_id, status, detected_at DESC);

-- 2. Backfill jobs table tracking automated and manual edge-to-cloud synchronization
CREATE TABLE IF NOT EXISTS recording_backfill_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000',
    branch_id VARCHAR(64) NOT NULL,
    camera_id VARCHAR(64) NOT NULL,
    gap_id UUID REFERENCES recording_gaps(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SCANNING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED'
    trigger_source VARCHAR(32) NOT NULL DEFAULT 'AUTO_WAN_RECOVERY', -- 'AUTO_WAN_RECOVERY', 'MANUAL_OPERATOR', 'SCHEDULED_AUDIT'
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    total_segments INTEGER NOT NULL DEFAULT 0,
    synced_segments INTEGER NOT NULL DEFAULT 0,
    skipped_duplicates INTEGER NOT NULL DEFAULT 0,
    reconciled_overlaps INTEGER NOT NULL DEFAULT 0,
    failed_segments INTEGER NOT NULL DEFAULT 0,
    total_bytes BIGINT NOT NULL DEFAULT 0,
    transferred_bytes BIGINT NOT NULL DEFAULT 0,
    rate_limit_kbps INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited bandwidth, otherwise throttle kbps
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_backfill_jobs_status 
    ON recording_backfill_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backfill_jobs_branch 
    ON recording_backfill_jobs (branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backfill_jobs_camera 
    ON recording_backfill_jobs (camera_id, created_at DESC);

-- 3. Edge backfill audit ledger (tamper-evident forensic verification of all recovered segments)
CREATE TABLE IF NOT EXISTS edge_backfill_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES recording_backfill_jobs(id) ON DELETE SET NULL,
    tenant_id VARCHAR(64) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000',
    branch_id VARCHAR(64) NOT NULL,
    camera_id VARCHAR(64) NOT NULL,
    segment_id VARCHAR(128) NOT NULL,
    action VARCHAR(32) NOT NULL, -- 'SYNCHRONIZED', 'SKIPPED_DUPLICATE', 'OVERLAP_RECONCILED', 'INTEGRITY_FAILED'
    file_size BIGINT NOT NULL DEFAULT 0,
    checksum_sha256 VARCHAR(64) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edge_backfill_audit_camera 
    ON edge_backfill_audit_log (camera_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_edge_backfill_audit_job 
    ON edge_backfill_audit_log (job_id, logged_at DESC);
