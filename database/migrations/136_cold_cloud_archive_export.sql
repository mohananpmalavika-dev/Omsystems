-- Migration 136: Cold Cloud Archive Export (recording.archive)
-- Production tables, indexes, and schema enhancements for long-term automated archival
-- of marked incident video to S3 / Glacier object storage with SHA-256 integrity and retrieval workflows.

-- 1. Cold Cloud Archive Jobs Table
CREATE TABLE IF NOT EXISTS cold_cloud_archive_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000',
    incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
    incident_number VARCHAR(128) NOT NULL,
    camera_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64),
    evidence_package_id UUID,
    clip_id UUID,
    storage_tier VARCHAR(32) NOT NULL DEFAULT 'GLACIER', -- 'GLACIER', 'DEEP_ARCHIVE', 'GLACIER_IR', 'INTELLIGENT_TIERING'
    s3_bucket VARCHAR(255) NOT NULL,
    s3_key VARCHAR(1024) NOT NULL,
    s3_region VARCHAR(64) NOT NULL DEFAULT 'us-east-1',
    s3_endpoint VARCHAR(512),
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    checksum_sha256 VARCHAR(64) NOT NULL,
    encryption_kms_key_id VARCHAR(255),
    archive_status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'EXPORTING', 'ARCHIVED', 'FAILED', 'CANCELLED'
    restore_status VARCHAR(32) NOT NULL DEFAULT 'NONE', -- 'NONE', 'RESTORE_REQUESTED', 'RESTORING', 'RESTORED', 'EXPIRED'
    restore_requested_at TIMESTAMPTZ,
    restore_completed_at TIMESTAMPTZ,
    restore_expires_at TIMESTAMPTZ,
    restore_tier VARCHAR(32), -- 'Expedited', 'Standard', 'Bulk'
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cold_archive_jobs_status 
    ON cold_cloud_archive_jobs (archive_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cold_archive_jobs_tenant 
    ON cold_cloud_archive_jobs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cold_archive_jobs_incident 
    ON cold_cloud_archive_jobs (incident_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cold_archive_jobs_camera 
    ON cold_cloud_archive_jobs (camera_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cold_archive_jobs_restore 
    ON cold_cloud_archive_jobs (restore_status, restore_requested_at DESC);


-- 2. Cold Cloud Archive Policies Table
CREATE TABLE IF NOT EXISTS cold_cloud_archive_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000',
    name VARCHAR(128) NOT NULL,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    target_storage_class VARCHAR(32) NOT NULL DEFAULT 'GLACIER', -- 'GLACIER', 'DEEP_ARCHIVE', 'GLACIER_IR'
    target_bucket VARCHAR(255) NOT NULL,
    target_prefix VARCHAR(255) NOT NULL DEFAULT 'incident-archives',
    trigger_condition JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"severities": ["CRITICAL", "HIGH"], "incidentStatuses": ["closed", "archived"], "ageDays": 30, "markedForArchive": true}
    encryption_kms_key_id VARCHAR(255),
    retention_days INTEGER NOT NULL DEFAULT 2555, -- 7 years default
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cold_archive_policies_tenant 
    ON cold_cloud_archive_policies (tenant_id, enabled);


-- 3. Cold Cloud Archive Audit Log (Tamper-evident chain of custody)
CREATE TABLE IF NOT EXISTS cold_cloud_archive_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES cold_cloud_archive_jobs(id) ON DELETE SET NULL,
    tenant_id VARCHAR(64) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000',
    incident_id UUID,
    incident_number VARCHAR(128),
    action VARCHAR(64) NOT NULL, -- 'ARCHIVE_QUEUED', 'UPLOAD_STARTED', 'UPLOAD_COMPLETED', 'TIERED_TO_GLACIER', 'INTEGRITY_VERIFIED', 'RESTORE_REQUESTED', 'RESTORE_COMPLETED', 'RESTORE_EXPIRED', 'EXPORT_FAILED'
    operator_id VARCHAR(64),
    checksum_sha256 VARCHAR(64),
    s3_uri VARCHAR(1024),
    storage_class VARCHAR(32),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cold_archive_audit_job 
    ON cold_cloud_archive_audit_log (job_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_cold_archive_audit_tenant 
    ON cold_cloud_archive_audit_log (tenant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_cold_archive_audit_incident 
    ON cold_cloud_archive_audit_log (incident_id, timestamp DESC);
