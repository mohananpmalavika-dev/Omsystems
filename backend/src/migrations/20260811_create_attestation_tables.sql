-- TPM Attestation Infrastructure Schema
-- Supports remote attestation, boot integrity verification, and hardware trust

-- ============================================================================
-- Device Attestation Identities
-- Stores TPM Attestation Key (AK) public keys for each device
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_attestation_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    device_id UUID NOT NULL,
    
    -- Attestation Key (public portion only)
    ak_public_key_pem TEXT NOT NULL,
    ak_name TEXT,
    
    -- TPM provenance
    ek_public_key_hash TEXT,
    tpm_manufacturer TEXT,
    tpm_firmware_version TEXT,
    
    -- Trust level
    trust_level TEXT NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (trust_level IN ('UNVERIFIED', 'ENROLLED', 'TPM_PROVEN')),
    
    -- Lifecycle
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (tenant_id, device_id)
);

CREATE INDEX idx_device_attestation_identities_tenant_device 
    ON device_attestation_identities(tenant_id, device_id);

CREATE INDEX idx_device_attestation_identities_trust_level 
    ON device_attestation_identities(tenant_id, trust_level) 
    WHERE revoked_at IS NULL;

COMMENT ON TABLE device_attestation_identities IS 
    'TPM Attestation Key identities enrolled per device';

-- ============================================================================
-- TPM Attestation Challenges
-- Backend-generated nonces for preventing replay attacks
-- ============================================================================

CREATE TABLE IF NOT EXISTS tpm_attestation_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    device_id UUID NOT NULL,
    
    -- Challenge nonce (stored as hash, not plaintext)
    nonce_hash BYTEA NOT NULL,
    
    -- Required PCR selection
    requested_pcrs INTEGER[] NOT NULL,
    hash_algorithm TEXT NOT NULL DEFAULT 'sha256',
    
    -- Challenge lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    
    -- Associated policy
    policy_id UUID
);

CREATE INDEX idx_tpm_attestation_challenges_device 
    ON tpm_attestation_challenges(tenant_id, device_id, created_at DESC);

CREATE INDEX idx_tpm_attestation_challenges_expires 
    ON tpm_attestation_challenges(expires_at) 
    WHERE used_at IS NULL;

COMMENT ON TABLE tpm_attestation_challenges IS 
    'Fresh nonces for TPM attestation - prevents replay attacks';

-- ============================================================================
-- Device Attestations
-- Historical record of all attestation attempts and results
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_attestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    device_id UUID NOT NULL,
    
    -- Challenge responded to
    challenge_id UUID NOT NULL REFERENCES tpm_attestation_challenges(id),
    
    -- Verification result
    status TEXT NOT NULL
        CHECK (status IN ('VERIFIED', 'FAILED', 'UNKNOWN', 'UNSUPPORTED', 'NOT_CONFIGURED', 'STALE')),
    
    assurance TEXT NOT NULL DEFAULT 'NONE'
        CHECK (assurance IN ('NONE', 'SELF_REPORTED', 'SIGNED_AGENT', 'HARDWARE_ATTESTED')),
    
    -- Individual verification checks
    quote_verified BOOLEAN NOT NULL DEFAULT FALSE,
    nonce_verified BOOLEAN NOT NULL DEFAULT FALSE,
    pcr_digest_verified BOOLEAN NOT NULL DEFAULT FALSE,
    policy_verified BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Failure details
    failure_reasons JSONB,
    
    -- Measured state
    pcr_values JSONB NOT NULL,
    secure_boot_enabled BOOLEAN,
    
    -- Policy used
    boot_policy_id UUID,
    
    -- Timing
    attested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_attestations_device 
    ON device_attestations(tenant_id, device_id, attested_at DESC);

CREATE INDEX idx_device_attestations_status 
    ON device_attestations(tenant_id, status, attested_at DESC);

CREATE INDEX idx_device_attestations_policy 
    ON device_attestations(boot_policy_id) 
    WHERE boot_policy_id IS NOT NULL;

COMMENT ON TABLE device_attestations IS 
    'Historical record of TPM attestation attempts and verification results';

-- ============================================================================
-- Boot Attestation Policies
-- Known-good PCR baselines for different platforms
-- ============================================================================

CREATE TABLE IF NOT EXISTS boot_attestation_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    
    name TEXT NOT NULL,
    description TEXT,
    
    -- Platform identification
    platform_type TEXT NOT NULL,
    hardware_model TEXT,
    firmware_version TEXT,
    operating_system TEXT,
    os_version TEXT,
    
    -- Hash algorithm
    hash_algorithm TEXT NOT NULL DEFAULT 'sha256'
        CHECK (hash_algorithm IN ('sha1', 'sha256', 'sha384', 'sha512')),
    
    -- Required PCRs
    required_pcrs INTEGER[] NOT NULL,
    
    -- Allowed measurements (JSONB array of {pcr, values[], description})
    allowed_measurements JSONB NOT NULL,
    
    -- Event log validation rules (optional)
    event_log_rules JSONB,
    
    -- Policy lifecycle
    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'OBSERVING', 'APPROVED', 'ACTIVE', 'RETIRED')),
    
    version INTEGER NOT NULL DEFAULT 1,
    
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    
    UNIQUE (tenant_id, name, version)
);

CREATE INDEX idx_boot_attestation_policies_tenant 
    ON boot_attestation_policies(tenant_id, status);

CREATE INDEX idx_boot_attestation_policies_platform 
    ON boot_attestation_policies(platform_type, hardware_model);

CREATE INDEX idx_boot_attestation_policies_active 
    ON boot_attestation_policies(tenant_id, status, valid_from, valid_until) 
    WHERE status = 'ACTIVE';

COMMENT ON TABLE boot_attestation_policies IS 
    'Known-good PCR baselines for different device platforms';

-- ============================================================================
-- Attestation Events
-- Audit trail of attestation activities and security events
-- ============================================================================

CREATE TABLE IF NOT EXISTS attestation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    device_id UUID NOT NULL,
    
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    
    status TEXT,
    
    message TEXT NOT NULL,
    details JSONB,
    
    -- Related alert
    alert_id UUID,
    
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attestation_events_device 
    ON attestation_events(tenant_id, device_id, timestamp DESC);

CREATE INDEX idx_attestation_events_type 
    ON attestation_events(event_type, timestamp DESC);

CREATE INDEX idx_attestation_events_severity 
    ON attestation_events(severity, timestamp DESC) 
    WHERE severity IN ('ERROR', 'CRITICAL');

COMMENT ON TABLE attestation_events IS 
    'Audit trail of attestation activities and security events';

-- ============================================================================
-- Measured Boot Logs
-- TCG event logs for boot integrity validation
-- ============================================================================

CREATE TABLE IF NOT EXISTS measured_boot_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    device_id UUID NOT NULL,
    attestation_id UUID NOT NULL REFERENCES device_attestations(id),
    
    -- Event log metadata
    spec_version TEXT NOT NULL,
    platform_type TEXT NOT NULL,
    
    -- Event log data (can be large)
    events JSONB NOT NULL,
    
    -- Final PCR state
    final_pcr_values JSONB NOT NULL,
    
    -- Validation
    validated BOOLEAN NOT NULL DEFAULT FALSE,
    validation_errors JSONB,
    
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_measured_boot_logs_device 
    ON measured_boot_logs(tenant_id, device_id, captured_at DESC);

CREATE INDEX idx_measured_boot_logs_attestation 
    ON measured_boot_logs(attestation_id);

COMMENT ON TABLE measured_boot_logs IS 
    'TCG measured boot event logs for detailed boot integrity analysis';

-- ============================================================================
-- Attestation Configuration
-- Tenant-specific attestation settings
-- ============================================================================

CREATE TABLE IF NOT EXISTS attestation_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL UNIQUE,
    
    -- Freshness requirements
    max_attestation_age_seconds INTEGER NOT NULL DEFAULT 86400, -- 24 hours
    challenge_expiration_seconds INTEGER NOT NULL DEFAULT 300, -- 5 minutes
    nonce_length_bytes INTEGER NOT NULL DEFAULT 32,
    
    -- Re-attestation
    re_attestation_interval_seconds INTEGER,
    
    -- Operations requiring attestation
    required_for_operations JSONB DEFAULT '[]'::jsonb,
    
    -- Failure mode
    failure_mode TEXT NOT NULL DEFAULT 'CLOSED'
        CHECK (failure_mode IN ('CLOSED', 'OPEN')),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attestation_config_tenant 
    ON attestation_config(tenant_id);

COMMENT ON TABLE attestation_config IS 
    'Tenant-specific TPM attestation configuration';

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Latest attestation per device
CREATE OR REPLACE VIEW v_latest_device_attestations AS
SELECT DISTINCT ON (tenant_id, device_id)
    id,
    tenant_id,
    device_id,
    challenge_id,
    status,
    assurance,
    quote_verified,
    nonce_verified,
    pcr_digest_verified,
    policy_verified,
    failure_reasons,
    pcr_values,
    secure_boot_enabled,
    boot_policy_id,
    attested_at,
    EXTRACT(EPOCH FROM (NOW() - attested_at)) AS age_seconds
FROM device_attestations
ORDER BY tenant_id, device_id, attested_at DESC;

COMMENT ON VIEW v_latest_device_attestations IS 
    'Most recent attestation per device with age calculation';

-- Attestation health summary
CREATE OR REPLACE VIEW v_attestation_health AS
SELECT
    tenant_id,
    COUNT(DISTINCT device_id) AS total_devices,
    COUNT(DISTINCT device_id) FILTER (WHERE status = 'VERIFIED') AS verified_devices,
    COUNT(DISTINCT device_id) FILTER (WHERE status = 'FAILED') AS failed_devices,
    COUNT(DISTINCT device_id) FILTER (WHERE status = 'STALE') AS stale_devices,
    COUNT(DISTINCT device_id) FILTER (WHERE status = 'UNSUPPORTED') AS unsupported_devices,
    COUNT(DISTINCT device_id) FILTER (WHERE assurance = 'HARDWARE_ATTESTED') AS hardware_attested_devices,
    AVG(age_seconds) AS avg_attestation_age_seconds
FROM v_latest_device_attestations
GROUP BY tenant_id;

COMMENT ON VIEW v_attestation_health IS 
    'Aggregate attestation health metrics per tenant';

-- ============================================================================
-- Functions
-- ============================================================================

-- Mark challenge as used (atomic, one-time use)
CREATE OR REPLACE FUNCTION consume_attestation_challenge(
    p_challenge_id UUID,
    p_device_id UUID
) RETURNS TABLE(
    success BOOLEAN,
    challenge_record RECORD
) AS $$
DECLARE
    v_challenge RECORD;
BEGIN
    UPDATE tpm_attestation_challenges
    SET used_at = NOW()
    WHERE id = p_challenge_id
        AND device_id = p_device_id
        AND used_at IS NULL
        AND expires_at > NOW()
    RETURNING * INTO v_challenge;
    
    IF FOUND THEN
        RETURN QUERY SELECT TRUE, v_challenge;
    ELSE
        RETURN QUERY SELECT FALSE, NULL::RECORD;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION consume_attestation_challenge IS 
    'Atomically consume a challenge (one-time use, not expired)';

-- Check if device attestation is fresh
CREATE OR REPLACE FUNCTION is_attestation_fresh(
    p_tenant_id UUID,
    p_device_id UUID,
    p_max_age_seconds INTEGER DEFAULT 86400
) RETURNS BOOLEAN AS $$
DECLARE
    v_latest_attestation RECORD;
BEGIN
    SELECT * INTO v_latest_attestation
    FROM v_latest_device_attestations
    WHERE tenant_id = p_tenant_id
        AND device_id = p_device_id
        AND status = 'VERIFIED';
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    RETURN v_latest_attestation.age_seconds <= p_max_age_seconds;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION is_attestation_fresh IS 
    'Check if device has fresh verified attestation';

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_device_attestation_identities_updated_at
    BEFORE UPDATE ON device_attestation_identities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_boot_attestation_policies_updated_at
    BEFORE UPDATE ON boot_attestation_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attestation_config_updated_at
    BEFORE UPDATE ON attestation_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Initial Data
-- ============================================================================

-- Default attestation configuration template
-- (Will be created per-tenant on first use)

COMMENT ON SCHEMA public IS 
    'TPM Attestation Schema - Remote attestation, boot integrity, hardware trust';
