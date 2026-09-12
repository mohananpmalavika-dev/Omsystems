-- ============================================================================
-- Migration: 123_durable_evidence_pipeline.sql
-- Description: Durable Forensic Evidence Capture Jobs, Assets, Manifests, 
--              Hashes, Chain of Custody, and Bank Export Packages
-- ============================================================================

-- 1. Evidence Capture Jobs (Durable State Machine)
CREATE TABLE IF NOT EXISTS evidence_capture_jobs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    alert_id TEXT NOT NULL,
    incident_id TEXT,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL, -- P1, P2, P3, P4
    status TEXT NOT NULL DEFAULT 'REQUESTED', 
    -- State machine: REQUESTED -> QUEUED -> CAPTURING -> VERIFYING -> HASHING -> PERSISTING -> SIGNING -> COMPLETE
    -- Failure states: FAILED_RETRYABLE, FAILED_PERMANENT, PARTIAL, CANCELLED
    capture_source TEXT NOT NULL DEFAULT 'RECORDER_ARCHIVE',
    requested_start_at TIMESTAMPTZ NOT NULL,
    requested_end_at TIMESTAMPTZ NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL,
    pre_event_seconds INT NOT NULL DEFAULT 15,
    post_event_seconds INT NOT NULL DEFAULT 30,
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    failure_code TEXT,
    failure_reason TEXT,
    latency_ms INT,
    idempotency_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_evidence_jobs_tenant_alert 
    ON evidence_capture_jobs(tenant_id, alert_id);
CREATE INDEX IF NOT EXISTS idx_evidence_jobs_status 
    ON evidence_capture_jobs(status);

-- 2. Evidence Assets (Footage MP4, Snapshot JPG, Metadata JSON, Audit JSON)
CREATE TABLE IF NOT EXISTS evidence_assets (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES evidence_capture_jobs(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL, -- 'clip', 'snapshot', 'metadata', 'audit', 'signature'
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size BIGINT NOT NULL,
    sha256 TEXT NOT NULL,
    storage_node TEXT NOT NULL DEFAULT 'primary_nvme',
    storage_path TEXT NOT NULL,
    duration_seconds NUMERIC(10, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_assets_job 
    ON evidence_assets(job_id, asset_type);

-- 3. Evidence Manifests (Forensic Bank Manifest)
CREATE TABLE IF NOT EXISTS evidence_manifests (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL UNIQUE REFERENCES evidence_capture_jobs(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    incident_id TEXT,
    alert_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    recorder_id TEXT,
    channel INT DEFAULT 1,
    capture_start TIMESTAMPTZ NOT NULL,
    capture_end TIMESTAMPTZ NOT NULL,
    device_timestamp TIMESTAMPTZ NOT NULL,
    server_timestamp TIMESTAMPTZ NOT NULL,
    observed_clock_offset_ms INT NOT NULL DEFAULT 0,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    operator_id TEXT,
    capture_reason TEXT NOT NULL,
    case_number TEXT,
    asset_sha256 TEXT NOT NULL,
    manifest_sha256 TEXT NOT NULL,
    signature_algorithm TEXT NOT NULL DEFAULT 'RSASSA-PKCS1-v1_5-SHA256',
    signature_bytes TEXT NOT NULL,
    certificate_thumbprint TEXT,
    custody_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    software_version TEXT NOT NULL DEFAULT 'KryptoVision-1.0.0-rc2',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Evidence Hashes (Crypto Hash Chain for continuous tamper detection)
CREATE TABLE IF NOT EXISTS evidence_hashes (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES evidence_capture_jobs(id) ON DELETE CASCADE,
    sequence_num INT NOT NULL,
    block_type TEXT NOT NULL, -- 'frame', 'segment', 'manifest', 'custody'
    block_hash TEXT NOT NULL,
    prev_hash TEXT NOT NULL,
    signature TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(job_id, sequence_num)
);

-- 5. Evidence Exports (Export Packages for Judicial / Banking Compliance)
CREATE TABLE IF NOT EXISTS evidence_exports (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    job_id TEXT NOT NULL REFERENCES evidence_capture_jobs(id),
    case_number TEXT,
    export_format TEXT NOT NULL DEFAULT 'BANK_ZIP_BUNDLE',
    package_sha256 TEXT NOT NULL,
    package_signature TEXT NOT NULL,
    package_size_bytes BIGINT NOT NULL,
    exported_by_user_id TEXT NOT NULL,
    export_reason TEXT NOT NULL,
    download_url TEXT,
    download_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Evidence Chain of Custody (Immutable)
CREATE TABLE IF NOT EXISTS evidence_chain_of_custody (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES evidence_capture_jobs(id) ON DELETE CASCADE,
    sequence_index INT NOT NULL,
    action TEXT NOT NULL, -- 'CAPTURED', 'HASH_VERIFIED', 'SEALED', 'EXPORTED', 'TRANSFERRED', 'PURGED'
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    actor_role TEXT,
    source_ip TEXT,
    reason TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    evidence_sha256 TEXT NOT NULL,
    signature TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(job_id, sequence_index)
);

-- 7. Evidence Capture Attempts
CREATE TABLE IF NOT EXISTS evidence_capture_attempts (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES evidence_capture_jobs(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL,
    stage TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    latency_ms INT,
    error_code TEXT,
    error_message TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
