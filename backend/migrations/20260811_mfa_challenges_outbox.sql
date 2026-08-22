-- Migration: MFA Challenges and Notification Outbox
-- Purpose: Replace ephemeral OTP storage with proper state machine and durable delivery
-- Date: 2026-08-11

-- ============================================================================
-- MFA CHALLENGES TABLE
-- ============================================================================
-- Replaces the simple mfa_otp_codes table with a proper challenge lifecycle
-- States: CREATED → QUEUED → SENDING → SENT → VERIFIED → CONSUMED
-- Failure paths: DELIVERY_FAILED, EXPIRED, LOCKED, PROVIDER_UNAVAILABLE

CREATE TABLE IF NOT EXISTS mfa_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Challenge metadata
    method VARCHAR(32) NOT NULL CHECK (method IN ('sms', 'email', 'totp')),
    purpose VARCHAR(64) NOT NULL DEFAULT 'login_mfa' 
        CHECK (purpose IN ('login_mfa', 'setup_verification', 'password_reset', 'sensitive_operation')),
    
    -- Secure storage (never store plaintext)
    destination_hash TEXT NOT NULL, -- SHA256 of phone/email for correlation without exposure
    otp_hash TEXT NOT NULL, -- SHA256 of OTP for verification
    otp_ciphertext TEXT, -- Encrypted OTP for delivery (cleared after send)
    
    -- State machine
    status VARCHAR(32) NOT NULL DEFAULT 'CREATED'
        CHECK (status IN (
            'CREATED', 'QUEUED', 'SENDING', 'SENT', 
            'VERIFIED', 'CONSUMED', 'EXPIRED', 'LOCKED', 
            'DELIVERY_FAILED', 'PROVIDER_UNAVAILABLE', 'SUPERSEDED'
        )),
    
    -- Attempt tracking
    verification_attempts INTEGER NOT NULL DEFAULT 0,
    max_verification_attempts INTEGER NOT NULL DEFAULT 5,
    send_attempts INTEGER NOT NULL DEFAULT 0,
    max_send_attempts INTEGER NOT NULL DEFAULT 3,
    
    -- Timestamps
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Delivery tracking
    provider VARCHAR(32),
    provider_message_id TEXT,
    last_error_code TEXT,
    last_error_message TEXT
);

-- Indexes for performance
CREATE INDEX idx_mfa_challenges_user_status 
    ON mfa_challenges(user_id, status) 
    WHERE status IN ('SENT', 'QUEUED');

CREATE INDEX idx_mfa_challenges_expires 
    ON mfa_challenges(expires_at) 
    WHERE status IN ('SENT', 'QUEUED', 'SENDING');

CREATE INDEX idx_mfa_challenges_tenant 
    ON mfa_challenges(tenant_id, created_at DESC);

-- ============================================================================
-- NOTIFICATION OUTBOX TABLE
-- ============================================================================
-- Transactional outbox pattern for reliable message delivery
-- Supports SMS, email, push notifications, webhooks

CREATE TABLE IF NOT EXISTS notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Optional tenant context
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Routing
    channel VARCHAR(16) NOT NULL CHECK (channel IN ('sms', 'email', 'push', 'webhook')),
    template VARCHAR(64) NOT NULL, -- e.g., 'mfa_otp', 'alert_critical', 'password_reset'
    
    -- Destination
    recipient TEXT NOT NULL, -- Phone number, email, device token, URL
    
    -- Payload (encrypted if contains sensitive data)
    payload JSONB NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional context for delivery
    
    -- Idempotency
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    
    -- State tracking
    status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'expired', 'cancelled')),
    
    -- Retry logic
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Provider tracking
    provider VARCHAR(32),
    provider_message_id TEXT,
    
    -- Error tracking
    last_error_code TEXT,
    last_error_message TEXT,
    retryable BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ, -- For message expiry (e.g., OTP validity)
    
    -- Cleanup tracking
    sensitive_payload_cleared BOOLEAN NOT NULL DEFAULT false
);

-- Indexes for worker processing
CREATE INDEX idx_notification_outbox_pending 
    ON notification_outbox(next_attempt_at, status) 
    WHERE status = 'pending' AND next_attempt_at <= NOW();

CREATE INDEX idx_notification_outbox_processing 
    ON notification_outbox(status, updated_at) 
    WHERE status = 'processing';

CREATE INDEX idx_notification_outbox_channel 
    ON notification_outbox(channel, status, created_at DESC);

CREATE INDEX idx_notification_outbox_tenant 
    ON notification_outbox(tenant_id, created_at DESC) 
    WHERE tenant_id IS NOT NULL;

-- Cleanup index for expired/old records
CREATE INDEX idx_notification_outbox_cleanup 
    ON notification_outbox(created_at) 
    WHERE status IN ('sent', 'failed', 'expired', 'cancelled');

-- ============================================================================
-- MFA RATE LIMITING TABLE
-- ============================================================================
-- Track rate limits per user, destination, IP, tenant

CREATE TABLE IF NOT EXISTS mfa_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Rate limit scope
    limit_type VARCHAR(32) NOT NULL 
        CHECK (limit_type IN ('user', 'destination', 'ip_address', 'tenant')),
    limit_key TEXT NOT NULL, -- User ID, hashed destination, IP, tenant ID
    
    -- Operation tracking
    operation VARCHAR(32) NOT NULL 
        CHECK (operation IN ('send', 'verify', 'resend')),
    
    -- Counters
    attempt_count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_duration_seconds INTEGER NOT NULL DEFAULT 600, -- 10 minutes default
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    
    UNIQUE(limit_type, limit_key, operation, window_start)
);

CREATE INDEX idx_mfa_rate_limits_check 
    ON mfa_rate_limits(limit_type, limit_key, operation, expires_at) 
    WHERE expires_at > NOW();

-- ============================================================================
-- MFA PROVIDER HEALTH TABLE
-- ============================================================================
-- Track SMS/Email provider health for availability reporting

CREATE TABLE IF NOT EXISTS mfa_provider_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    provider VARCHAR(32) NOT NULL,
    channel VARCHAR(16) NOT NULL,
    
    -- Health status
    healthy BOOLEAN NOT NULL DEFAULT true,
    last_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Error tracking
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    last_success_at TIMESTAMPTZ,
    
    -- Metrics (last 5 minutes)
    recent_send_count INTEGER NOT NULL DEFAULT 0,
    recent_success_count INTEGER NOT NULL DEFAULT 0,
    recent_failure_count INTEGER NOT NULL DEFAULT 0,
    avg_latency_ms INTEGER,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(provider, channel)
);

-- ============================================================================
-- UPDATED TIMESTAMP TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_mfa_challenges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mfa_challenges_updated_at
    BEFORE UPDATE ON mfa_challenges
    FOR EACH ROW
    EXECUTE FUNCTION update_mfa_challenges_updated_at();

CREATE TRIGGER mfa_provider_health_updated_at
    BEFORE UPDATE ON mfa_provider_health
    FOR EACH ROW
    EXECUTE FUNCTION update_mfa_challenges_updated_at();

-- ============================================================================
-- DATA MIGRATION FROM OLD SCHEMA
-- ============================================================================
-- Migrate existing mfa_otp_codes to mfa_challenges if table exists

DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'mfa_otp_codes') THEN
        INSERT INTO mfa_challenges (
            user_id,
            tenant_id,
            method,
            purpose,
            destination_hash,
            otp_hash,
            status,
            expires_at,
            created_at,
            provider
        )
        SELECT 
            user_id,
            tenant_id,
            method,
            'login_mfa',
            encode(sha256(COALESCE(phone_number, email, '')::bytea), 'hex'),
            code_hash,
            CASE 
                WHEN used = true THEN 'CONSUMED'
                WHEN expires_at < NOW() THEN 'EXPIRED'
                ELSE 'SENT'
            END,
            expires_at,
            created_at,
            NULL
        FROM mfa_otp_codes
        WHERE created_at > NOW() - INTERVAL '7 days'; -- Only migrate recent records
        
        RAISE NOTICE 'Migrated mfa_otp_codes to mfa_challenges';
    END IF;
END $$;

-- ============================================================================
-- CLEANUP POLICIES
-- ============================================================================
-- Automatically clean up old records to prevent unbounded growth

-- Function to cleanup old MFA challenges
CREATE OR REPLACE FUNCTION cleanup_old_mfa_challenges()
RETURNS void AS $$
BEGIN
    DELETE FROM mfa_challenges
    WHERE created_at < NOW() - INTERVAL '30 days'
      AND status IN ('CONSUMED', 'EXPIRED', 'LOCKED', 'DELIVERY_FAILED');
    
    DELETE FROM mfa_rate_limits
    WHERE expires_at < NOW() - INTERVAL '1 day';
    
    DELETE FROM notification_outbox
    WHERE created_at < NOW() - INTERVAL '7 days'
      AND status IN ('sent', 'failed', 'expired', 'cancelled')
      AND sensitive_payload_cleared = true;
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (if pg_cron is available)
-- SELECT cron.schedule('cleanup-mfa-challenges', '0 2 * * *', 'SELECT cleanup_old_mfa_challenges()');

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_challenges TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_outbox TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_rate_limits TO app_user;
GRANT SELECT, INSERT, UPDATE ON mfa_provider_health TO app_user;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE mfa_challenges IS 'Proper MFA challenge lifecycle with state machine tracking';
COMMENT ON TABLE notification_outbox IS 'Transactional outbox for reliable message delivery across all channels';
COMMENT ON TABLE mfa_rate_limits IS 'Rate limiting for MFA operations to prevent abuse';
COMMENT ON TABLE mfa_provider_health IS 'SMS/Email provider health monitoring';

COMMENT ON COLUMN mfa_challenges.otp_ciphertext IS 'Encrypted OTP for delivery - MUST be cleared after successful send';
COMMENT ON COLUMN mfa_challenges.destination_hash IS 'SHA256 hash for correlation without exposing PII';
COMMENT ON COLUMN notification_outbox.sensitive_payload_cleared IS 'Flag indicating encrypted OTP has been removed from payload';
