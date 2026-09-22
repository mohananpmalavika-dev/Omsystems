-- 011_biometric_privacy.sql
-- Production Biometric Privacy & DPDP/GDPR Compliance Schema

CREATE TABLE IF NOT EXISTS biometric_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    subject_id VARCHAR(100) NOT NULL,
    subject_type VARCHAR(50) NOT NULL DEFAULT 'employee',
    purpose TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    consent_document_ref VARCHAR(300),
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_biometric_consent_tenant_subject UNIQUE (tenant_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_biometric_consents_lookup 
ON biometric_consents (tenant_id, subject_id, status);

CREATE TABLE IF NOT EXISTS biometric_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    performed_by VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    subject_id VARCHAR(100),
    camera_id VARCHAR(100),
    match_score NUMERIC(5, 4),
    source_ip VARCHAR(50),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biometric_audit_logs_tenant_ts 
ON biometric_audit_logs (tenant_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS biometric_erasure_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number VARCHAR(100) NOT NULL UNIQUE,
    tenant_id VARCHAR(100) NOT NULL,
    subject_id VARCHAR(100) NOT NULL,
    requested_by VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    erased_embeddings_count INT NOT NULL DEFAULT 0,
    erased_thumbnails_count INT NOT NULL DEFAULT 0,
    cryptographic_signature TEXT NOT NULL,
    erased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biometric_erasure_tenant 
ON biometric_erasure_certificates (tenant_id, subject_id);
