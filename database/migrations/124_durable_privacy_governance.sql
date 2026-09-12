-- ============================================================================
-- Migration: 124_durable_privacy_governance.sql
-- Description: Durable Privacy Override Requests, Grants, Revocations, and 
--              Hash-Chained Privacy Access & Export Audit Ledger
-- ============================================================================

-- 1. Privacy Override Requests
CREATE TABLE IF NOT EXISTS privacy_override_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    camera_id TEXT NOT NULL,
    requested_by_user_id TEXT NOT NULL,
    requested_by_username TEXT NOT NULL,
    operation TEXT NOT NULL, -- 'LIVE', 'PLAYBACK', 'EXPORT'
    reason TEXT NOT NULL,
    case_number TEXT,
    incident_id TEXT,
    duration_minutes INT NOT NULL DEFAULT 10,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'PENDING' -- PENDING, APPROVED, REJECTED, EXPIRED
);

-- 2. Privacy Override Grants (Authoritative Active Grants)
CREATE TABLE IF NOT EXISTS privacy_override_grants (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    camera_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    operation TEXT NOT NULL, -- 'LIVE', 'PLAYBACK', 'EXPORT'
    grant_scope TEXT NOT NULL DEFAULT 'CAMERA_STREAM',
    reason TEXT NOT NULL,
    case_number TEXT,
    incident_id TEXT,
    approved_by TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ACTIVE' -- ACTIVE, EXPIRED, REVOKED
);

CREATE INDEX IF NOT EXISTS idx_privacy_grants_lookup 
    ON privacy_override_grants(tenant_id, user_id, camera_id, operation, status);

-- 3. Privacy Override Revocations
CREATE TABLE IF NOT EXISTS privacy_override_revocations (
    id TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL REFERENCES privacy_override_grants(id),
    revoked_by_user_id TEXT NOT NULL,
    revocation_reason TEXT NOT NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Privacy Access Audit (SHA-256 Hash Chained for Forensic Immutability)
CREATE TABLE IF NOT EXISTS privacy_access_audit (
    id TEXT PRIMARY KEY,
    sequence_num BIGSERIAL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    camera_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    event TEXT NOT NULL, -- 'PRIVACY_UNMASK_REQUESTED', 'PRIVACY_UNMASK_APPROVED', 'PRIVACY_UNMASK_EXPIRED', 'PRIVACY_UNMASK_REVOKED', 'UNMASKED_STREAM_VIEWED'
    operation TEXT NOT NULL, -- 'LIVE', 'PLAYBACK'
    incident_id TEXT,
    case_number TEXT,
    reason TEXT NOT NULL,
    source_ip TEXT,
    workstation_id TEXT,
    session_id TEXT,
    prev_hash TEXT NOT NULL,
    record_hash TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_audit_tenant_camera 
    ON privacy_access_audit(tenant_id, camera_id, timestamp);

-- 5. Privacy Export Audit
CREATE TABLE IF NOT EXISTS privacy_export_audit (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    exported_by_user_id TEXT NOT NULL,
    case_number TEXT NOT NULL,
    unredacted_justification TEXT NOT NULL,
    supervisor_approver_id TEXT NOT NULL,
    export_sha256 TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
