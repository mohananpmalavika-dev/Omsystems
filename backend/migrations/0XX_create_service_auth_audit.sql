-- Migration: Create service authentication audit table
-- Purpose: Audit trail for service-to-service authentication and authorization events
-- Security: Compliance, forensics, and security monitoring

-- =====================================================
-- Service Authentication Audit Table
-- =====================================================

CREATE TABLE IF NOT EXISTS service_auth_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- When the event occurred
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- What happened
    action VARCHAR(100) NOT NULL,
    
    -- Who made the request
    service_id VARCHAR(100) NOT NULL,
    credential_id VARCHAR(255) NOT NULL,
    
    -- Tenant context (if applicable)
    tenant_id VARCHAR(255),
    
    -- Decision
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('ALLOW', 'DENY')),
    
    -- Reason for decision
    reason TEXT,
    
    -- Request context
    request_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    
    -- Additional metadata (JSON)
    metadata JSONB,
    
    -- Check constraints
    CONSTRAINT chk_action_valid CHECK (
        action IN (
            'AUTHENTICATION_ATTEMPTED',
            'AUTHENTICATION_SUCCESS',
            'AUTHENTICATION_FAILED',
            'AUTHORIZATION_REQUESTED',
            'AUTHORIZATION_GRANTED',
            'AUTHORIZATION_DENIED',
            'NOTIFICATION_REQUESTED',
            'NOTIFICATION_ACCEPTED',
            'NOTIFICATION_REJECTED',
            'RATE_LIMIT_EXCEEDED',
            'REPLAY_DETECTED',
            'IDEMPOTENCY_CONFLICT'
        )
    )
);

-- =====================================================
-- Indexes
-- =====================================================

-- Index for time-based queries (most common)
CREATE INDEX idx_service_auth_audit_timestamp 
    ON service_auth_audit (timestamp DESC);

-- Index for service-specific queries
CREATE INDEX idx_service_auth_audit_service 
    ON service_auth_audit (service_id, timestamp DESC);

-- Index for tenant-specific queries
CREATE INDEX idx_service_auth_audit_tenant 
    ON service_auth_audit (tenant_id, timestamp DESC)
    WHERE tenant_id IS NOT NULL;

-- Index for action-based queries
CREATE INDEX idx_service_auth_audit_action 
    ON service_auth_audit (action, timestamp DESC);

-- Index for decision-based queries (finding denials)
CREATE INDEX idx_service_auth_audit_decision 
    ON service_auth_audit (decision, timestamp DESC)
    WHERE decision = 'DENY';

-- Index for request tracing
CREATE INDEX idx_service_auth_audit_request 
    ON service_auth_audit (request_id)
    WHERE request_id IS NOT NULL;

-- GIN index for metadata queries
CREATE INDEX idx_service_auth_audit_metadata 
    ON service_auth_audit USING GIN (metadata);

-- =====================================================
-- Partitioning (Optional - for high volume)
-- =====================================================

-- For production systems with high audit volume, consider partitioning by timestamp:
-- 
-- CREATE TABLE service_auth_audit (
--     -- columns as above
-- ) PARTITION BY RANGE (timestamp);
-- 
-- CREATE TABLE service_auth_audit_2026_01 PARTITION OF service_auth_audit
--     FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- 
-- CREATE TABLE service_auth_audit_2026_02 PARTITION OF service_auth_audit
--     FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- 
-- -- Automate partition creation with pg_partman or custom scripts

-- =====================================================
-- Retention Policy (Optional)
-- =====================================================

-- Add a retention policy to automatically archive/delete old audit records
-- This can be implemented as a periodic cleanup job:
--
-- DELETE FROM service_auth_audit
-- WHERE timestamp < NOW() - INTERVAL '90 days';
--
-- Or use pg_cron:
-- SELECT cron.schedule(
--     'cleanup-old-audit-records',
--     '0 2 * * *', -- Daily at 2 AM
--     $$DELETE FROM service_auth_audit WHERE timestamp < NOW() - INTERVAL '90 days'$$
-- );

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE service_auth_audit IS 
    'Audit trail for service-to-service authentication and authorization events. Immutable log for compliance and security monitoring.';

COMMENT ON COLUMN service_auth_audit.timestamp IS 
    'When the audit event occurred (UTC)';

COMMENT ON COLUMN service_auth_audit.action IS 
    'Type of action being audited (authentication, authorization, notification, etc.)';

COMMENT ON COLUMN service_auth_audit.service_id IS 
    'Service identifier that made the request';

COMMENT ON COLUMN service_auth_audit.credential_id IS 
    'Credential/key ID used for authentication';

COMMENT ON COLUMN service_auth_audit.tenant_id IS 
    'Tenant context if request was tenant-scoped';

COMMENT ON COLUMN service_auth_audit.decision IS 
    'Whether the action was allowed or denied (ALLOW/DENY)';

COMMENT ON COLUMN service_auth_audit.reason IS 
    'Human-readable reason for the decision';

COMMENT ON COLUMN service_auth_audit.request_id IS 
    'Request correlation ID for distributed tracing';

COMMENT ON COLUMN service_auth_audit.ip_address IS 
    'Source IP address of the request';

COMMENT ON COLUMN service_auth_audit.metadata IS 
    'Additional context as JSON (capabilities, error details, etc.)';

-- =====================================================
-- Sample Usage
-- =====================================================

-- Record successful authentication:
-- INSERT INTO service_auth_audit (
--     action, service_id, credential_id, decision, request_id
-- )
-- VALUES (
--     'AUTHENTICATION_SUCCESS', 'analytics-engine', 'cred-123', 'ALLOW', 'req-456'
-- );

-- Record authorization denial:
-- INSERT INTO service_auth_audit (
--     action, service_id, credential_id, tenant_id, decision, reason, metadata
-- )
-- VALUES (
--     'AUTHORIZATION_DENIED', 'analytics-engine', 'cred-123', 'tenant-789',
--     'DENY', 'Service lacks notifications:create capability',
--     '{"required_capability": "notifications:create", "available_capabilities": ["analytics:submit"]}'::jsonb
-- );

-- Query denied requests in last 24 hours:
-- SELECT timestamp, service_id, action, reason
-- FROM service_auth_audit
-- WHERE decision = 'DENY'
--   AND timestamp > NOW() - INTERVAL '24 hours'
-- ORDER BY timestamp DESC;

-- Query all events for a specific service:
-- SELECT timestamp, action, decision, tenant_id, reason
-- FROM service_auth_audit
-- WHERE service_id = 'analytics-engine'
--   AND timestamp > NOW() - INTERVAL '7 days'
-- ORDER BY timestamp DESC;

-- Find rate limit violations:
-- SELECT timestamp, service_id, tenant_id, metadata
-- FROM service_auth_audit
-- WHERE action = 'RATE_LIMIT_EXCEEDED'
--   AND timestamp > NOW() - INTERVAL '1 hour'
-- ORDER BY timestamp DESC;

-- =====================================================
-- Security Considerations
-- =====================================================

-- 1. This table should be INSERT-only (no UPDATE/DELETE except for retention cleanup)
-- 2. Consider using a separate database user with INSERT-only permissions
-- 3. For sensitive environments, implement table-level encryption
-- 4. Export audit logs to SIEM/log aggregation system for long-term retention
-- 5. Monitor for anomalies: sudden spikes in DENY decisions, new service IDs, etc.

-- Grant appropriate permissions:
-- GRANT INSERT ON service_auth_audit TO backend_app_user;
-- GRANT SELECT ON service_auth_audit TO audit_reader_user;
-- REVOKE UPDATE, DELETE ON service_auth_audit FROM backend_app_user;
