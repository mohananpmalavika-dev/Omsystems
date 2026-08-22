-- Migration: Create service notification idempotency table
-- Purpose: Store idempotency records for service-to-service notification requests
-- Security: Prevents duplicate notification delivery via idempotency keys

-- =====================================================
-- Service Notification Idempotency Table
-- =====================================================

CREATE TABLE IF NOT EXISTS service_notification_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Composite key for idempotency
    tenant_id VARCHAR(255) NOT NULL,
    caller_service VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    
    -- Request fingerprint for conflict detection
    request_hash VARCHAR(64) NOT NULL,
    
    -- Reference to created notification
    notification_id UUID NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Unique constraint: one idempotency key per tenant+service
    CONSTRAINT uq_service_notification_idempotency 
        UNIQUE (tenant_id, caller_service, idempotency_key),
    
    -- Foreign key to notifications table (if exists)
    -- CONSTRAINT fk_notification 
    --     FOREIGN KEY (notification_id) 
    --     REFERENCES notifications(id) 
    --     ON DELETE CASCADE,
    
    -- Check constraint: expires_at must be in the future at creation
    CONSTRAINT chk_expires_at_future 
        CHECK (expires_at > created_at)
);

-- =====================================================
-- Indexes
-- =====================================================

-- Index for lookup by tenant + service + key (primary lookup path)
CREATE INDEX idx_service_notification_idempotency_lookup 
    ON service_notification_idempotency (tenant_id, caller_service, idempotency_key)
    WHERE expires_at > NOW();

-- Index for cleanup of expired records
CREATE INDEX idx_service_notification_idempotency_expires 
    ON service_notification_idempotency (expires_at)
    WHERE expires_at < NOW();

-- Index for queries by notification ID
CREATE INDEX idx_service_notification_idempotency_notification 
    ON service_notification_idempotency (notification_id);

-- Index for statistics by service
CREATE INDEX idx_service_notification_idempotency_service 
    ON service_notification_idempotency (caller_service, created_at)
    WHERE expires_at > NOW();

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE service_notification_idempotency IS 
    'Idempotency records for service-to-service notification requests. Prevents duplicate notification delivery.';

COMMENT ON COLUMN service_notification_idempotency.tenant_id IS 
    'Tenant identifier for multi-tenant isolation';

COMMENT ON COLUMN service_notification_idempotency.caller_service IS 
    'Service identifier (e.g., analytics-engine, recording-service)';

COMMENT ON COLUMN service_notification_idempotency.idempotency_key IS 
    'Client-provided idempotency key (e.g., event-{eventId})';

COMMENT ON COLUMN service_notification_idempotency.request_hash IS 
    'SHA-256 hash of request content for conflict detection';

COMMENT ON COLUMN service_notification_idempotency.notification_id IS 
    'Reference to created notification record';

COMMENT ON COLUMN service_notification_idempotency.expires_at IS 
    'When this idempotency record expires (typically 24 hours after creation)';

-- =====================================================
-- Sample Usage
-- =====================================================

-- Insert idempotency record (done after notification creation):
-- INSERT INTO service_notification_idempotency (
--     tenant_id, caller_service, idempotency_key, request_hash, 
--     notification_id, expires_at
-- )
-- VALUES (
--     'tenant-123', 'analytics-engine', 'alert-987', 'abc123...', 
--     'notif-456', NOW() + INTERVAL '24 hours'
-- )
-- ON CONFLICT (tenant_id, caller_service, idempotency_key) DO NOTHING;

-- Check for existing idempotency record:
-- SELECT notification_id, request_hash
-- FROM service_notification_idempotency
-- WHERE tenant_id = 'tenant-123'
--   AND caller_service = 'analytics-engine'
--   AND idempotency_key = 'alert-987'
--   AND expires_at > NOW();

-- Cleanup expired records (run periodically):
-- DELETE FROM service_notification_idempotency
-- WHERE expires_at < NOW();
