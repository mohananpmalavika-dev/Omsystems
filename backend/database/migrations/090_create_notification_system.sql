-- Unified Notification System Schema
-- Replaces email_queue and sms_queue with durable outbox pattern

-- =====================================================
-- Core Notifications Table
-- Represents logical business notifications
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant isolation
    tenant_id UUID NOT NULL,
    
    -- Notification classification
    type VARCHAR(100) NOT NULL, -- e.g., 'intrusion_detected', 'prediction_alert', 'camera_offline'
    
    -- Source tracking
    source_type VARCHAR(100), -- e.g., 'detection', 'prediction', 'health_check'
    source_id VARCHAR(255),   -- e.g., detection ID, prediction ID
    
    -- Content
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    
    -- Additional context
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Indexes for tenant and source lookups
    CONSTRAINT fk_notifications_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_tenant ON notifications(tenant_id, created_at DESC);
CREATE INDEX idx_notifications_source ON notifications(source_type, source_id) WHERE source_type IS NOT NULL;
CREATE INDEX idx_notifications_type ON notifications(tenant_id, type, created_at DESC);

-- =====================================================
-- Notification Deliveries (Outbox Pattern)
-- Each row represents ONE channel delivery attempt
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Link to logical notification
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    
    -- Tenant isolation (denormalized for query performance)
    tenant_id UUID NOT NULL,
    
    -- Channel and destination
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'webhook', 'in_app')),
    destination TEXT NOT NULL, -- email address, phone number, push token, webhook URL, or user ID
    
    -- Content (may be customized per channel)
    subject TEXT,
    title TEXT,
    body TEXT NOT NULL,
    
    -- Template support
    template_id VARCHAR(100),
    template_data JSONB,
    
    -- Additional context
    metadata JSONB DEFAULT '{}',
    
    -- Priority
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'processing', 'accepted', 'delivered', 'retry_wait', 'failed', 'cancelled')),
    
    -- Idempotency
    idempotency_key VARCHAR(255),
    
    -- Retry logic
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Worker locking
    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(255), -- worker instance ID
    
    -- Provider tracking
    provider VARCHAR(50), -- e.g., 'smtp_primary', 'twilio', 'fcm'
    provider_message_id VARCHAR(255), -- external provider's message ID
    
    -- Error tracking
    last_error TEXT,
    last_error_code VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    
    CONSTRAINT fk_deliveries_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE
);

-- Critical indexes for worker efficiency
CREATE INDEX idx_deliveries_pending ON notification_deliveries(status, next_attempt_at, priority DESC) 
    WHERE status = 'pending';
    
CREATE INDEX idx_deliveries_retry_wait ON notification_deliveries(status, next_attempt_at) 
    WHERE status = 'retry_wait';

CREATE INDEX idx_deliveries_tenant ON notification_deliveries(tenant_id, created_at DESC);
CREATE INDEX idx_deliveries_notification ON notification_deliveries(notification_id);
CREATE INDEX idx_deliveries_status ON notification_deliveries(tenant_id, status, created_at DESC);
CREATE INDEX idx_deliveries_provider_msg ON notification_deliveries(provider, provider_message_id) 
    WHERE provider_message_id IS NOT NULL;

-- Unique constraint for idempotency
CREATE UNIQUE INDEX idx_deliveries_idempotency ON notification_deliveries(tenant_id, idempotency_key, channel) 
    WHERE idempotency_key IS NOT NULL;

-- =====================================================
-- Delivery Attempts (Audit Trail)
-- Records every delivery attempt for debugging
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    delivery_id UUID NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
    
    attempt_number INTEGER NOT NULL,
    
    provider VARCHAR(50),
    
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    success BOOLEAN NOT NULL,
    
    response_code VARCHAR(100),
    provider_message_id VARCHAR(255),
    
    error_code VARCHAR(100),
    error_message TEXT,
    
    duration_ms INTEGER,
    
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_delivery_attempts_delivery ON notification_delivery_attempts(delivery_id, attempt_number);
CREATE INDEX idx_delivery_attempts_time ON notification_delivery_attempts(started_at DESC);

-- =====================================================
-- User Push Devices
-- Manages push notification tokens
-- =====================================================
CREATE TABLE IF NOT EXISTS user_push_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    platform VARCHAR(20) CHECK (platform IN ('android', 'ios', 'web')),
    
    push_token TEXT NOT NULL,
    
    active BOOLEAN NOT NULL DEFAULT true,
    
    last_seen_at TIMESTAMPTZ,
    
    device_info JSONB DEFAULT '{}', -- Optional device metadata
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_push_devices_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_push_devices_user ON user_push_devices(user_id, active);
CREATE INDEX idx_push_devices_tenant ON user_push_devices(tenant_id, user_id);
CREATE UNIQUE INDEX idx_push_devices_token ON user_push_devices(push_token) WHERE active = true;

-- =====================================================
-- Notification Policies
-- Controls how events trigger notifications
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    
    event_type VARCHAR(100) NOT NULL, -- e.g., 'fire_detected', 'camera_offline'
    
    enabled BOOLEAN NOT NULL DEFAULT true,
    
    minimum_severity VARCHAR(20), -- e.g., 'P1', 'P2', etc.
    
    channels JSONB NOT NULL DEFAULT '[]', -- ['email', 'sms', 'push']
    
    cooldown_seconds INTEGER DEFAULT 0, -- Suppress duplicate alerts
    
    escalation_rules JSONB, -- Optional escalation configuration
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_policies_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_policies_tenant ON notification_policies(tenant_id, event_type);
CREATE INDEX idx_policies_enabled ON notification_policies(tenant_id, enabled) WHERE enabled = true;

-- =====================================================
-- Notification Preferences (User-level)
-- Allows users to customize their notification settings
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Channel preferences
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    sms_enabled BOOLEAN NOT NULL DEFAULT false,
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    
    -- Event type filters
    event_filters JSONB DEFAULT '{}', -- { "camera_offline": false, "intrusion": true }
    
    -- Quiet hours
    quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_preferences_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE,
        
    UNIQUE(user_id)
);

CREATE INDEX idx_preferences_user ON notification_preferences(user_id);
CREATE INDEX idx_preferences_tenant ON notification_preferences(tenant_id);

-- =====================================================
-- Worker Health Tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_worker_health (
    worker_id VARCHAR(255) PRIMARY KEY,
    
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    jobs_processed INTEGER NOT NULL DEFAULT 0,
    jobs_failed INTEGER NOT NULL DEFAULT 0,
    
    status VARCHAR(20) NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'stopped')),
    
    metadata JSONB DEFAULT '{}'
);

-- =====================================================
-- Views for Monitoring
-- =====================================================

-- Active delivery queue depth by channel
CREATE OR REPLACE VIEW v_notification_queue_depth AS
SELECT 
    tenant_id,
    channel,
    status,
    priority,
    COUNT(*) as count,
    MIN(created_at) as oldest_pending
FROM notification_deliveries
WHERE status IN ('pending', 'retry_wait')
GROUP BY tenant_id, channel, status, priority;

-- Delivery success rates (last 24 hours)
CREATE OR REPLACE VIEW v_notification_delivery_stats_24h AS
SELECT 
    tenant_id,
    channel,
    provider,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
    COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))) as avg_delivery_time_seconds
FROM notification_deliveries
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY tenant_id, channel, provider;

-- Failed deliveries needing attention
CREATE OR REPLACE VIEW v_notification_failures AS
SELECT 
    nd.id,
    nd.tenant_id,
    n.type as notification_type,
    nd.channel,
    nd.destination,
    nd.attempt_count,
    nd.last_error,
    nd.failed_at,
    nd.created_at
FROM notification_deliveries nd
JOIN notifications n ON n.id = nd.notification_id
WHERE nd.status = 'failed'
ORDER BY nd.failed_at DESC;

-- =====================================================
-- Functions
-- =====================================================

-- Function to reset stuck processing jobs (for worker recovery)
CREATE OR REPLACE FUNCTION reset_stuck_notification_deliveries(timeout_minutes INTEGER DEFAULT 5)
RETURNS INTEGER AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    UPDATE notification_deliveries
    SET 
        status = 'pending',
        locked_at = NULL,
        locked_by = NULL,
        next_attempt_at = NOW()
    WHERE 
        status = 'processing'
        AND locked_at < NOW() - (timeout_minutes || ' minutes')::INTERVAL;
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old delivery attempts (retention)
CREATE OR REPLACE FUNCTION cleanup_old_delivery_attempts(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    DELETE FROM notification_delivery_attempts
    WHERE started_at < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- Function to mark push device as inactive
CREATE OR REPLACE FUNCTION deactivate_push_device(token TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE user_push_devices
    SET active = false
    WHERE push_token = token;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Scheduled Jobs (using pg_cron if available)
-- =====================================================

-- Reset stuck jobs every 5 minutes
-- SELECT cron.schedule('reset-stuck-notifications', '*/5 * * * *', 'SELECT reset_stuck_notification_deliveries(5)');

-- Clean up old attempts weekly
-- SELECT cron.schedule('cleanup-delivery-attempts', '0 2 * * 0', 'SELECT cleanup_old_delivery_attempts(90)');

-- =====================================================
-- Migration Note
-- =====================================================

-- The old email_queue and sms_queue tables should be:
-- 1. Stopped from receiving new writes
-- 2. Drained by a one-time migration script
-- 3. Renamed to email_queue_deprecated and sms_queue_deprecated
-- 4. Eventually dropped after verification

COMMENT ON TABLE notifications IS 'Logical business notifications - one record per event';
COMMENT ON TABLE notification_deliveries IS 'Physical delivery jobs - one per channel per notification';
COMMENT ON TABLE notification_delivery_attempts IS 'Audit trail of all delivery attempts';
COMMENT ON TABLE user_push_devices IS 'Push notification token registry';
COMMENT ON TABLE notification_policies IS 'Tenant-level notification routing rules';
COMMENT ON TABLE notification_preferences IS 'User-level notification preferences';
