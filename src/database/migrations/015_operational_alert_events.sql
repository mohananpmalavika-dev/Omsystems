-- Migration: Operational Alert Events and Actions
-- Purpose: Add append-only audit trail for alert actions and proper identity tracking
-- Author: System
-- Date: 2026-08-11

-- =====================================================================
-- OPERATIONAL ALERT EVENTS TABLE
-- =====================================================================
-- Append-only audit log for all alert state changes and actions.
-- Records WHO performed WHAT action WHEN with full context.

CREATE TABLE IF NOT EXISTS operational_alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Alert identification
    alert_id VARCHAR(200) NOT NULL,
    tenant_id UUID NOT NULL,
    branch_id UUID,
    
    -- Event classification
    event_type VARCHAR(50) NOT NULL,
    -- Possible values:
    --   ALERT_CREATED
    --   ALERT_ACKNOWLEDGED
    --   ALERT_ASSIGNED
    --   ALERT_REASSIGNED
    --   ALERT_ESCALATED
    --   ALERT_COMMENTED
    --   ALERT_RESOLVED
    --   ALERT_REOPENED
    --   ALERT_SUPPRESSED
    --   ALERT_AUTO_RESOLVED
    
    -- Actor (WHO performed the action)
    actor_type VARCHAR(20) NOT NULL DEFAULT 'USER',
    -- Possible values: USER, SYSTEM, AUTOMATION
    actor_user_id UUID,
    actor_user_name VARCHAR(200),
    actor_service VARCHAR(100),
    
    -- Target user (for assignment operations)
    target_user_id UUID,
    target_user_name VARCHAR(200),
    
    -- State transition
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    previous_severity VARCHAR(20),
    new_severity VARCHAR(20),
    
    -- Event metadata (flexible JSON for event-specific data)
    metadata JSONB DEFAULT '{}'::jsonb,
    -- Examples:
    --   For RESOLVED: { "resolutionCode": "FALSE_POSITIVE", "comment": "..." }
    --   For ASSIGNED: { "previousAssignee": "user-123", "reason": "..." }
    --   For ESCALATED: { "reason": "...", "recipients": [...] }
    
    -- Request tracking
    request_id VARCHAR(128),
    correlation_id UUID,
    session_id UUID,
    
    -- Network context
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamps
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Indexes
    CONSTRAINT operational_alert_events_event_type_check 
        CHECK (event_type IN (
            'ALERT_CREATED', 
            'ALERT_ACKNOWLEDGED', 
            'ALERT_ASSIGNED', 
            'ALERT_REASSIGNED',
            'ALERT_ESCALATED',
            'ALERT_COMMENTED',
            'ALERT_RESOLVED',
            'ALERT_REOPENED',
            'ALERT_SUPPRESSED',
            'ALERT_AUTO_RESOLVED'
        )),
    
    CONSTRAINT operational_alert_events_actor_type_check 
        CHECK (actor_type IN ('USER', 'SYSTEM', 'AUTOMATION'))
);

-- Indexes for efficient querying
CREATE INDEX idx_operational_alert_events_alert_id 
    ON operational_alert_events(alert_id);

CREATE INDEX idx_operational_alert_events_tenant_id 
    ON operational_alert_events(tenant_id);

CREATE INDEX idx_operational_alert_events_branch_id 
    ON operational_alert_events(branch_id) 
    WHERE branch_id IS NOT NULL;

CREATE INDEX idx_operational_alert_events_actor_user_id 
    ON operational_alert_events(actor_user_id) 
    WHERE actor_user_id IS NOT NULL;

CREATE INDEX idx_operational_alert_events_occurred_at 
    ON operational_alert_events(occurred_at DESC);

CREATE INDEX idx_operational_alert_events_event_type 
    ON operational_alert_events(event_type);

-- Composite index for alert timeline queries
CREATE INDEX idx_operational_alert_events_alert_timeline 
    ON operational_alert_events(alert_id, occurred_at DESC);

-- Composite index for user activity queries
CREATE INDEX idx_operational_alert_events_user_activity 
    ON operational_alert_events(tenant_id, actor_user_id, occurred_at DESC) 
    WHERE actor_user_id IS NOT NULL;

-- =====================================================================
-- OPERATIONAL ALERTS TABLE ENHANCEMENTS
-- =====================================================================
-- Add columns to track current state and enable optimistic locking

-- Note: operational_alerts table is currently generated dynamically.
-- If a persistent table exists or will be created, add these columns:

-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS acknowledged_by UUID;
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS acknowledged_by_name VARCHAR(200);
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS assigned_to UUID;
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS assigned_to_name VARCHAR(200);
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS assigned_by UUID;
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS assigned_by_name VARCHAR(200);
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS resolved_by UUID;
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS resolved_by_name VARCHAR(200);
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS resolution_code VARCHAR(50);
-- ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS resolution_comment TEXT;

-- =====================================================================
-- COMMENTS
-- =====================================================================

COMMENT ON TABLE operational_alert_events IS 
    'Append-only audit log for all operational alert actions and state transitions';

COMMENT ON COLUMN operational_alert_events.alert_id IS 
    'Identifier of the alert (may be composite like "hdd:branch-123:disk-1")';

COMMENT ON COLUMN operational_alert_events.event_type IS 
    'Type of event that occurred (ALERT_ACKNOWLEDGED, ALERT_RESOLVED, etc.)';

COMMENT ON COLUMN operational_alert_events.actor_type IS 
    'Type of actor: USER (human operator), SYSTEM (automated process), AUTOMATION (rule/policy)';

COMMENT ON COLUMN operational_alert_events.actor_user_id IS 
    'User ID of the person who performed the action (when actor_type = USER)';

COMMENT ON COLUMN operational_alert_events.metadata IS 
    'Event-specific data stored as JSON (resolution codes, comments, reasons, etc.)';

COMMENT ON COLUMN operational_alert_events.occurred_at IS 
    'Server timestamp when the event occurred (source of truth for ordering)';

-- =====================================================================
-- GRANTS
-- =====================================================================

-- Application should have INSERT and SELECT privileges
-- UPDATE and DELETE should be restricted to prevent tampering

-- Example (adjust role names as needed):
-- GRANT SELECT, INSERT ON operational_alert_events TO app_user;
-- REVOKE UPDATE, DELETE ON operational_alert_events FROM app_user;
