-- =====================================================
-- Notification Infrastructure Schema
-- Production-ready notification & escalation subsystem
-- =====================================================

-- =====================================================
-- 1. RECIPIENT GROUPS
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_recipient_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    scope_type VARCHAR(50) NOT NULL DEFAULT 'TENANT',
    scope_region_ids UUID[] DEFAULT '{}',
    scope_branch_ids UUID[] DEFAULT '{}',
    scope_alert_types VARCHAR(100)[] DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT unique_tenant_group_name UNIQUE(tenant_id, name) WHERE deleted_at IS NULL
);

CREATE INDEX idx_recipient_groups_tenant ON notification_recipient_groups(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recipient_groups_scope ON notification_recipient_groups(scope_type, tenant_id);

-- =====================================================
-- 2. RECIPIENT GROUP MEMBERS
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_recipient_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES notification_recipient_groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    display_name VARCHAR(200) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    voice_number VARCHAR(50),
    preferred_language VARCHAR(10) DEFAULT 'en',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT at_least_one_contact CHECK (email IS NOT NULL OR phone IS NOT NULL OR voice_number IS NOT NULL)
);

CREATE INDEX idx_recipient_members_group ON notification_recipient_members(group_id);
CREATE INDEX idx_recipient_members_user ON notification_recipient_members(user_id);
CREATE INDEX idx_recipient_members_enabled ON notification_recipient_members(group_id, enabled);

-- =====================================================
-- 3. NOTIFICATION TEMPLATES
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    template_key VARCHAR(100) NOT NULL,
    channel VARCHAR(30) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    subject_template TEXT,
    body_template TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_channel CHECK (channel IN ('email', 'sms', 'voice', 'push', 'dashboard', 'webhook'))
);

CREATE INDEX idx_notification_templates_key ON notification_templates(template_key, channel);
CREATE INDEX idx_notification_templates_tenant ON notification_templates(tenant_id);

-- Insert default templates
INSERT INTO notification_templates (template_key, channel, subject_template, body_template, variables, is_default) VALUES
('CAMERA_OFFLINE', 'email', '[{{severity}}] Camera Offline - {{camera.name}}', 
 'Camera {{camera.name}} at {{branch.name}} went offline at {{incident.occurredAt}}.\n\nIncident ID: {{incident.id}}\nBranch: {{branch.name}}\nCamera: {{camera.name}}\nTime: {{incident.occurredAt}}\n\nPlease investigate immediately.', 
 '["severity", "camera.name", "branch.name", "incident.occurredAt", "incident.id"]', true),
 
('CAMERA_OFFLINE', 'sms', NULL, 
 '{{severity}} Camera {{camera.name}} offline at {{branch.name}}. Incident: {{incident.id}}', 
 '["severity", "camera.name", "branch.name", "incident.id"]', true),
 
('VAULT_INTRUSION', 'email', '[P1 CRITICAL] Vault Intrusion Detected', 
 'CRITICAL: Vault intrusion detected at {{branch.name}}.\n\nCamera: {{camera.name}}\nTime: {{incident.occurredAt}}\nIncident: {{incident.id}}\n\nImmediate action required.', 
 '["branch.name", "camera.name", "incident.occurredAt", "incident.id"]', true),
 
('VAULT_INTRUSION', 'sms', NULL, 
 'P1 CRITICAL: Vault intrusion {{branch.name}} {{camera.name}}. ID: {{incident.id}}', 
 '["branch.name", "camera.name", "incident.id"]', true),
 
('FIRE_DETECTED', 'email', '[P1 CRITICAL] Fire Detected', 
 'CRITICAL: Fire detected at {{branch.name}}.\n\nCamera: {{camera.name}}\nTime: {{incident.occurredAt}}\nIncident: {{incident.id}}\n\nEvacuate and call emergency services.', 
 '["branch.name", "camera.name", "incident.occurredAt", "incident.id"]', true),
 
('FIRE_DETECTED', 'sms', NULL, 
 'P1 FIRE: {{branch.name}} {{camera.name}}. EVACUATE. ID: {{incident.id}}', 
 '["branch.name", "camera.name", "incident.id"]', true);

-- =====================================================
-- 4. NOTIFICATION POLICIES
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    
    -- Scope configuration
    scope_type VARCHAR(50) NOT NULL DEFAULT 'TENANT',
    scope_region_ids UUID[] DEFAULT '{}',
    scope_branch_ids UUID[] DEFAULT '{}',
    scope_device_ids UUID[] DEFAULT '{}',
    scope_alert_types VARCHAR(100)[] DEFAULT '{}',
    
    -- Priority rules (JSONB for flexibility)
    p1_rule JSONB NOT NULL DEFAULT '{"channels": ["dashboard", "sms", "email", "voice"], "recipientGroupIds": [], "requireAcknowledgement": true, "repeatUntilAcknowledged": true}',
    p2_rule JSONB NOT NULL DEFAULT '{"channels": ["dashboard", "email", "sms"], "recipientGroupIds": [], "requireAcknowledgement": true, "repeatUntilAcknowledged": false}',
    p3_rule JSONB NOT NULL DEFAULT '{"channels": ["dashboard", "email"], "recipientGroupIds": [], "requireAcknowledgement": false, "repeatUntilAcknowledged": false}',
    p4_rule JSONB NOT NULL DEFAULT '{"channels": ["dashboard"], "recipientGroupIds": [], "requireAcknowledgement": false, "repeatUntilAcknowledged": false}',
    p5_rule JSONB NOT NULL DEFAULT '{"channels": [], "recipientGroupIds": [], "requireAcknowledgement": false, "repeatUntilAcknowledged": false}',
    
    -- Quiet hours
    quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    quiet_hours_timezone VARCHAR(100) DEFAULT 'UTC',
    quiet_hours_bypass_severities VARCHAR(10)[] DEFAULT '{"P1"}',
    
    -- Rate limiting
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 120,
    rate_limit_per_recipient_per_minute INTEGER NOT NULL DEFAULT 10,
    
    -- Escalation policies
    p1_escalation JSONB DEFAULT '{"acknowledgeRequired": true, "steps": []}',
    p2_escalation JSONB DEFAULT '{"acknowledgeRequired": true, "steps": []}',
    p3_escalation JSONB DEFAULT '{"acknowledgeRequired": false, "steps": []}',
    p4_escalation JSONB DEFAULT '{"acknowledgeRequired": false, "steps": []}',
    p5_escalation JSONB DEFAULT '{"acknowledgeRequired": false, "steps": []}',
    
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    published_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    
    CONSTRAINT valid_status CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'ARCHIVED')),
    CONSTRAINT valid_scope_type CHECK (scope_type IN ('TENANT', 'REGION', 'BRANCH', 'DEVICE', 'CAMERA', 'ALERT_TYPE'))
);

CREATE INDEX idx_notification_policies_tenant ON notification_policies(tenant_id, status);
CREATE INDEX idx_notification_policies_scope ON notification_policies(scope_type, tenant_id);
CREATE INDEX idx_notification_policies_published ON notification_policies(tenant_id, status, published_at) WHERE status = 'PUBLISHED';

-- =====================================================
-- 5. NOTIFICATION POLICY VERSIONS (History)
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_policy_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES notification_policies(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    snapshot JSONB NOT NULL,
    change_summary TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_policy_version UNIQUE(policy_id, version)
);

CREATE INDEX idx_policy_versions_policy ON notification_policy_versions(policy_id, version DESC);

-- =====================================================
-- 6. NOTIFICATION OUTBOX (Transactional Pattern)
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Source context
    incident_id UUID,
    alert_id UUID,
    policy_id UUID REFERENCES notification_policies(id),
    escalation_step INTEGER DEFAULT 0,
    
    -- Notification details
    channel VARCHAR(30) NOT NULL,
    recipient_id UUID REFERENCES notification_recipient_members(id),
    recipient_display_name VARCHAR(200) NOT NULL,
    recipient_destination VARCHAR(500) NOT NULL,
    recipient_destination_masked VARCHAR(500),
    
    -- Template and content
    template_key VARCHAR(100),
    subject TEXT,
    body TEXT NOT NULL,
    variables JSONB DEFAULT '{}',
    
    -- Delivery control
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Provider details
    provider_name VARCHAR(100),
    provider_message_id VARCHAR(500),
    
    -- Deduplication
    dedup_key VARCHAR(500) NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_started_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    
    -- Error tracking
    last_error_code VARCHAR(100),
    last_error_message TEXT,
    error_history JSONB DEFAULT '[]',
    
    CONSTRAINT valid_channel CHECK (channel IN ('email', 'sms', 'voice', 'push', 'dashboard', 'webhook')),
    CONSTRAINT valid_status CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'RETRYING', 'FAILED', 'DEAD_LETTER', 'CANCELLED')),
    CONSTRAINT unique_dedup_key UNIQUE(dedup_key)
);

CREATE INDEX idx_notification_outbox_status ON notification_outbox(status, available_at) WHERE status IN ('PENDING', 'RETRYING');
CREATE INDEX idx_notification_outbox_tenant ON notification_outbox(tenant_id, created_at DESC);
CREATE INDEX idx_notification_outbox_incident ON notification_outbox(incident_id);
CREATE INDEX idx_notification_outbox_processing ON notification_outbox(status, processing_started_at) 
    WHERE status = 'PROCESSING' AND processing_started_at < NOW() - INTERVAL '5 minutes';

-- =====================================================
-- 7. NOTIFICATION DELIVERY TRACKING
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outbox_id UUID NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
    incident_id UUID,
    
    channel VARCHAR(30) NOT NULL,
    recipient_id UUID REFERENCES notification_recipient_members(id),
    recipient_display_name VARCHAR(200) NOT NULL,
    recipient_destination_masked VARCHAR(500),
    
    provider_name VARCHAR(100),
    provider_message_id VARCHAR(500),
    
    status VARCHAR(30) NOT NULL,
    attempt_number INTEGER NOT NULL,
    
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES users(id),
    
    error_code VARCHAR(100),
    error_message TEXT,
    
    latency_ms INTEGER,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_delivery_status CHECK (status IN ('SENT', 'DELIVERED', 'FAILED', 'ACKNOWLEDGED'))
);

CREATE INDEX idx_notification_deliveries_outbox ON notification_deliveries(outbox_id);
CREATE INDEX idx_notification_deliveries_incident ON notification_deliveries(incident_id, created_at DESC);
CREATE INDEX idx_notification_deliveries_tenant ON notification_deliveries(tenant_id, created_at DESC);
CREATE INDEX idx_notification_deliveries_recipient ON notification_deliveries(recipient_id, created_at DESC);

-- =====================================================
-- 8. ESCALATION JOBS
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_escalation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    incident_id UUID NOT NULL,
    policy_id UUID NOT NULL REFERENCES notification_policies(id),
    
    severity VARCHAR(10) NOT NULL,
    current_step INTEGER NOT NULL DEFAULT 0,
    total_steps INTEGER NOT NULL,
    
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    
    next_escalation_at TIMESTAMPTZ NOT NULL,
    
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES users(id),
    cancelled_at TIMESTAMPTZ,
    cancelled_reason TEXT,
    completed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_escalation_status CHECK (status IN ('ACTIVE', 'ACKNOWLEDGED', 'CANCELLED', 'COMPLETED', 'FAILED'))
);

CREATE INDEX idx_escalation_jobs_active ON notification_escalation_jobs(status, next_escalation_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_escalation_jobs_incident ON notification_escalation_jobs(incident_id);
CREATE INDEX idx_escalation_jobs_tenant ON notification_escalation_jobs(tenant_id, created_at DESC);

-- =====================================================
-- 9. NOTIFICATION PROVIDER CONFIGURATION
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    provider_key VARCHAR(100) NOT NULL,
    provider_type VARCHAR(50) NOT NULL,
    channel VARCHAR(30) NOT NULL,
    
    config JSONB NOT NULL,
    credentials_ref VARCHAR(500),
    
    enabled BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    priority INTEGER NOT NULL DEFAULT 100,
    
    health_status VARCHAR(30) DEFAULT 'UNKNOWN',
    last_health_check_at TIMESTAMPTZ,
    last_successful_send_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_provider_type CHECK (provider_type IN ('SMTP', 'SMPP', 'GSM_MODEM', 'SIP', 'TWILIO', 'SNS', 'WEBSOCKET', 'FCM', 'APNS', 'WEBHOOK')),
    CONSTRAINT valid_channel CHECK (channel IN ('email', 'sms', 'voice', 'push', 'dashboard', 'webhook'))
);

CREATE INDEX idx_provider_configs_tenant ON notification_provider_configs(tenant_id, channel, enabled);
CREATE INDEX idx_provider_configs_default ON notification_provider_configs(channel, is_default) WHERE is_default = true;

-- =====================================================
-- 10. NOTIFICATION AUDIT LOG
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    actor_id UUID REFERENCES users(id),
    actor_role VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    
    previous_value JSONB,
    new_value JSONB,
    
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_resource_type CHECK (resource_type IN ('POLICY', 'RECIPIENT_GROUP', 'RECIPIENT', 'TEMPLATE', 'PROVIDER', 'DELIVERY'))
);

CREATE INDEX idx_notification_audit_tenant ON notification_audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_notification_audit_resource ON notification_audit_log(resource_type, resource_id);
CREATE INDEX idx_notification_audit_actor ON notification_audit_log(actor_id, created_at DESC);

-- =====================================================
-- 11. NOTIFICATION RATE LIMIT TRACKING
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_rate_limit_buckets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bucket_key VARCHAR(500) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    
    count INTEGER NOT NULL DEFAULT 0,
    limit_value INTEGER NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_bucket_window UNIQUE(bucket_key, window_start)
);

CREATE INDEX idx_rate_limit_buckets_active ON notification_rate_limit_buckets(bucket_key, window_end) WHERE window_end > NOW();
CREATE INDEX idx_rate_limit_buckets_cleanup ON notification_rate_limit_buckets(window_end) WHERE window_end < NOW() - INTERVAL '1 hour';

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to mask sensitive contact information
CREATE OR REPLACE FUNCTION mask_destination(destination VARCHAR) 
RETURNS VARCHAR AS $$
BEGIN
    -- Email masking: show first 2 chars + domain
    IF destination LIKE '%@%' THEN
        RETURN SUBSTRING(destination, 1, 2) || '****@' || SPLIT_PART(destination, '@', 2);
    END IF;
    
    -- Phone masking: show country code + last 4 digits
    IF destination LIKE '+%' THEN
        RETURN SUBSTRING(destination, 1, 3) || ' ******' || RIGHT(destination, 4);
    END IF;
    
    -- Generic masking
    RETURN LEFT(destination, 4) || '****' || RIGHT(destination, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate deduplication key
CREATE OR REPLACE FUNCTION generate_notification_dedup_key(
    p_tenant_id UUID,
    p_incident_id UUID,
    p_policy_id UUID,
    p_escalation_step INTEGER,
    p_channel VARCHAR,
    p_recipient VARCHAR
) RETURNS VARCHAR AS $$
BEGIN
    RETURN p_tenant_id::TEXT || ':' || 
           COALESCE(p_incident_id::TEXT, 'null') || ':' || 
           COALESCE(p_policy_id::TEXT, 'null') || ':' || 
           p_escalation_step::TEXT || ':' || 
           p_channel || ':' || 
           p_recipient;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check quiet hours
CREATE OR REPLACE FUNCTION is_in_quiet_hours(
    p_time TIMESTAMPTZ,
    p_start TIME,
    p_end TIME,
    p_timezone VARCHAR,
    p_severity VARCHAR,
    p_bypass_severities VARCHAR[]
) RETURNS BOOLEAN AS $$
DECLARE
    v_local_time TIME;
    v_in_quiet_hours BOOLEAN;
BEGIN
    -- Bypass for critical severities
    IF p_severity = ANY(p_bypass_severities) THEN
        RETURN false;
    END IF;
    
    -- Convert to local time
    v_local_time := (p_time AT TIME ZONE p_timezone)::TIME;
    
    -- Handle quiet hours crossing midnight
    IF p_start <= p_end THEN
        v_in_quiet_hours := v_local_time >= p_start AND v_local_time < p_end;
    ELSE
        v_in_quiet_hours := v_local_time >= p_start OR v_local_time < p_end;
    END IF;
    
    RETURN v_in_quiet_hours;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- VIEWS
-- =====================================================

-- Active notification policies view
CREATE OR REPLACE VIEW v_active_notification_policies AS
SELECT 
    p.*,
    COUNT(DISTINCT rg.id) as recipient_group_count,
    u_created.email as created_by_email,
    u_updated.email as updated_by_email
FROM notification_policies p
LEFT JOIN notification_recipient_groups rg ON rg.tenant_id = p.tenant_id
LEFT JOIN users u_created ON p.created_by = u_created.id
LEFT JOIN users u_updated ON p.updated_by = u_updated.id
WHERE p.status = 'PUBLISHED'
GROUP BY p.id, u_created.email, u_updated.email;

-- Notification delivery statistics view
CREATE OR REPLACE VIEW v_notification_delivery_stats AS
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    tenant_id,
    channel,
    status,
    COUNT(*) as count,
    AVG(latency_ms) as avg_latency_ms,
    MAX(latency_ms) as max_latency_ms
FROM notification_deliveries
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at), tenant_id, channel, status;

-- Provider health view
CREATE OR REPLACE VIEW v_notification_provider_health AS
SELECT 
    pc.id,
    pc.tenant_id,
    pc.provider_key,
    pc.channel,
    pc.enabled,
    pc.health_status,
    pc.last_health_check_at,
    pc.last_successful_send_at,
    COUNT(CASE WHEN no.status = 'PENDING' THEN 1 END) as pending_count,
    COUNT(CASE WHEN no.status = 'FAILED' THEN 1 END) as failed_count,
    COUNT(CASE WHEN no.created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as recent_count
FROM notification_provider_configs pc
LEFT JOIN notification_outbox no ON no.provider_name = pc.provider_key AND no.created_at > NOW() - INTERVAL '24 hours'
GROUP BY pc.id, pc.tenant_id, pc.provider_key, pc.channel, pc.enabled, pc.health_status, 
         pc.last_health_check_at, pc.last_successful_send_at;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notification_policies_updated_at BEFORE UPDATE ON notification_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_recipient_groups_updated_at BEFORE UPDATE ON notification_recipient_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_recipient_members_updated_at BEFORE UPDATE ON notification_recipient_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-mask destination on insert
CREATE OR REPLACE FUNCTION auto_mask_destination()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.recipient_destination_masked IS NULL THEN
        NEW.recipient_destination_masked := mask_destination(NEW.recipient_destination);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_mask_outbox_destination BEFORE INSERT ON notification_outbox
    FOR EACH ROW EXECUTE FUNCTION auto_mask_destination();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE notification_recipient_groups IS 'Manages groups of notification recipients with scope-based routing';
COMMENT ON TABLE notification_outbox IS 'Transactional outbox pattern for durable notification delivery';
COMMENT ON TABLE notification_deliveries IS 'Tracks individual notification delivery attempts and acknowledgements';
COMMENT ON TABLE notification_escalation_jobs IS 'Manages multi-step escalation workflows for unacknowledged incidents';
COMMENT ON TABLE notification_provider_configs IS 'Configuration for notification delivery providers (SMTP, SMS, Voice, etc.)';
COMMENT ON TABLE notification_audit_log IS 'Immutable audit trail for all notification system changes';

COMMENT ON COLUMN notification_outbox.dedup_key IS 'Unique key preventing duplicate notifications: tenant:incident:policy:step:channel:recipient';
COMMENT ON COLUMN notification_outbox.available_at IS 'When this notification becomes eligible for processing (for delayed/scheduled sends)';
COMMENT ON COLUMN notification_policies.p1_rule IS 'Notification rule for P1/Critical severity: {"channels": ["dashboard", "sms"], "recipientGroupIds": ["uuid"], "requireAcknowledgement": true}';

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Create system-wide default notification policy template
-- This will be copied per tenant on first setup
-- Actual tenant policies will be created through the API

COMMIT;
