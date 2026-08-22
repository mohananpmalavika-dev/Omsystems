-- Integration & Interoperability Schema
-- This schema manages external system integrations, event processing, and correlation

-- Integration Connectors
CREATE TABLE integration_connectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    connector_type VARCHAR(50) NOT NULL, -- access-control, fire-alarm, intrusion-alarm, atm-monitoring, branch-management, central-monitoring, police-interface
    description TEXT,
    status VARCHAR(30) DEFAULT 'inactive', -- active, inactive, error, maintenance
    connection_method VARCHAR(50), -- rest-api, webhook, message-queue, mqtt, syslog, snmp, tcp-ip, sftp, email, onvif
    endpoint_url TEXT,
    authentication_method VARCHAR(50), -- oauth2, api-key, mutual-tls, basic-auth, certificate
    config_json JSONB DEFAULT '{}',
    health_check_interval_seconds INTEGER DEFAULT 300,
    retry_config_json JSONB DEFAULT '{"max_retries": 3, "backoff_multiplier": 2, "initial_delay_ms": 1000}',
    last_health_check_at TIMESTAMP WITH TIME ZONE,
    last_successful_event_at TIMESTAMP WITH TIME ZONE,
    events_received_count BIGINT DEFAULT 0,
    events_failed_count BIGINT DEFAULT 0,
    average_latency_ms DECIMAL(10,2),
    certificate_expiry_at TIMESTAMP WITH TIME ZONE,
    credential_expiry_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id),
    
    CONSTRAINT unique_connector_name UNIQUE(name)
);

CREATE INDEX idx_integration_connectors_type ON integration_connectors(connector_type);
CREATE INDEX idx_integration_connectors_status ON integration_connectors(status);

-- Integration Connector Versions (configuration versioning)
CREATE TABLE integration_connector_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id UUID NOT NULL REFERENCES integration_connectors(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    config_json JSONB NOT NULL,
    change_summary TEXT,
    activated_at TIMESTAMP WITH TIME ZONE,
    deactivated_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Integration Credentials (encrypted storage)
CREATE TABLE integration_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id UUID NOT NULL REFERENCES integration_connectors(id) ON DELETE CASCADE,
    credential_type VARCHAR(50) NOT NULL, -- api-key, oauth-token, certificate, username-password, signing-key
    credential_data_encrypted TEXT NOT NULL, -- encrypted credential information
    encryption_key_id VARCHAR(100), -- reference to key management system
    expires_at TIMESTAMP WITH TIME ZONE,
    rotation_required BOOLEAN DEFAULT false,
    last_rotated_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Integration Endpoints (multiple endpoints per connector)
CREATE TABLE integration_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id UUID NOT NULL REFERENCES integration_connectors(id) ON DELETE CASCADE,
    endpoint_type VARCHAR(50) NOT NULL, -- primary, backup, webhook, health-check
    url TEXT NOT NULL,
    method VARCHAR(10), -- GET, POST, PUT, PATCH
    headers_json JSONB DEFAULT '{}',
    timeout_seconds INTEGER DEFAULT 30,
    ip_allowlist TEXT[], -- array of allowed IP addresses
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Integration Health Checks
CREATE TABLE integration_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id UUID NOT NULL REFERENCES integration_connectors(id) ON DELETE CASCADE,
    check_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(30) NOT NULL, -- healthy, warning, error, unreachable
    response_time_ms INTEGER,
    error_message TEXT,
    details_json JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_health_checks_connector ON integration_health_checks(connector_id, check_time DESC);

-- External Events (normalized from all sources)
CREATE TABLE external_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(100) NOT NULL, -- external system event ID
    connector_id UUID NOT NULL REFERENCES integration_connectors(id),
    source_system VARCHAR(100) NOT NULL,
    source_device_id VARCHAR(100),
    event_type VARCHAR(100) NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    
    branch_id UUID REFERENCES branches(id),
    location_id VARCHAR(100),
    zone_id UUID,
    severity VARCHAR(20), -- info, low, medium, high, critical
    
    subject_json JSONB DEFAULT '{}', -- credential, employee, person info
    metadata_json JSONB DEFAULT '{}',
    
    delivery_state VARCHAR(30) DEFAULT 'received', -- received, validated, normalized, processed, acknowledged, retrying, failed, quarantined, replayed
    validation_result VARCHAR(30), -- valid, invalid, schema-error, mapping-error
    validation_errors TEXT[],
    signature_verified BOOLEAN,
    
    clock_offset_seconds DECIMAL(6,2),
    network_delay_ms INTEGER,
    correlation_id UUID,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_external_event UNIQUE(connector_id, event_id)
);

CREATE INDEX idx_external_events_connector ON external_events(connector_id, received_at DESC);
CREATE INDEX idx_external_events_branch ON external_events(branch_id, occurred_at DESC);
CREATE INDEX idx_external_events_type ON external_events(event_type, occurred_at DESC);
CREATE INDEX idx_external_events_severity ON external_events(severity, occurred_at DESC);
CREATE INDEX idx_external_events_state ON external_events(delivery_state);
CREATE INDEX idx_external_events_correlation ON external_events(correlation_id);

-- External Event Payloads (raw data storage)
CREATE TABLE external_event_payloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_event_id UUID NOT NULL REFERENCES external_events(id) ON DELETE CASCADE,
    raw_payload JSONB NOT NULL,
    raw_headers JSONB,
    content_type VARCHAR(100),
    payload_size_bytes INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_event_payloads_event ON external_event_payloads(external_event_id);

-- External Event Failures
CREATE TABLE external_event_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_event_id UUID NOT NULL REFERENCES external_events(id) ON DELETE CASCADE,
    failure_type VARCHAR(50), -- validation, processing, mapping, correlation, notification
    error_message TEXT,
    error_details_json JSONB,
    stack_trace TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_event_failures_event ON external_event_failures(external_event_id);
CREATE INDEX idx_event_failures_unresolved ON external_event_failures(resolved_at) WHERE resolved_at IS NULL;

-- External Event Retries
CREATE TABLE external_event_retries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_event_id UUID NOT NULL REFERENCES external_events(id) ON DELETE CASCADE,
    retry_attempt INTEGER NOT NULL,
    retry_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    result VARCHAR(30), -- success, failed, timeout
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- External Event Acknowledgements
CREATE TABLE external_event_acknowledgements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_event_id UUID NOT NULL REFERENCES external_events(id) ON DELETE CASCADE,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acknowledgement_type VARCHAR(50), -- manual, automatic, system
    notes TEXT
);

-- Integration Mappings (external to internal entity mapping)
CREATE TABLE integration_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id UUID NOT NULL REFERENCES integration_connectors(id) ON DELETE CASCADE,
    mapping_type VARCHAR(50) NOT NULL, -- device, location, zone, branch, employee, asset
    external_id VARCHAR(200) NOT NULL,
    internal_id UUID NOT NULL,
    internal_entity_type VARCHAR(50) NOT NULL, -- branch, camera, zone, device, employee
    additional_mapping_json JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id),
    
    CONSTRAINT unique_connector_mapping UNIQUE(connector_id, mapping_type, external_id)
);

CREATE INDEX idx_integration_mappings_connector ON integration_mappings(connector_id, mapping_type);
CREATE INDEX idx_integration_mappings_internal ON integration_mappings(internal_entity_type, internal_id);

-- Integration Mapping Versions
CREATE TABLE integration_mapping_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mapping_id UUID NOT NULL REFERENCES integration_mappings(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    mapping_data_json JSONB NOT NULL,
    change_type VARCHAR(30), -- created, updated, activated, deactivated
    change_summary TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Integration Rules (event processing rules)
CREATE TABLE integration_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    connector_id UUID REFERENCES integration_connectors(id),
    rule_type VARCHAR(50) NOT NULL, -- event-routing, alert-creation, video-preservation, notification, correlation
    priority INTEGER DEFAULT 100,
    
    condition_json JSONB NOT NULL, -- rule conditions
    action_json JSONB NOT NULL, -- actions to perform
    
    is_active BOOLEAN DEFAULT true,
    requires_approval BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    execution_count BIGINT DEFAULT 0,
    last_executed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_integration_rules_connector ON integration_rules(connector_id);
CREATE INDEX idx_integration_rules_active ON integration_rules(is_active, priority);

-- Integration Rule Versions
CREATE TABLE integration_rule_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES integration_rules(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    condition_json JSONB NOT NULL,
    action_json JSONB NOT NULL,
    change_summary TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Event Correlations (multi-event correlation)
CREATE TABLE event_correlations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id UUID NOT NULL,
    correlation_type VARCHAR(50) NOT NULL, -- multi-source, temporal, spatial, behavioral
    primary_event_id UUID REFERENCES external_events(id),
    
    time_window_start TIMESTAMP WITH TIME ZONE,
    time_window_end TIMESTAMP WITH TIME ZONE,
    branch_id UUID REFERENCES branches(id),
    location_context_json JSONB,
    
    confidence_score DECIMAL(5,2), -- 0-100
    correlation_factors TEXT[],
    
    incident_created BOOLEAN DEFAULT false,
    incident_id UUID REFERENCES incidents(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_event_correlations_correlation ON event_correlations(correlation_id);
CREATE INDEX idx_event_correlations_incident ON event_correlations(incident_id);

-- Integration Incident Links (link external events to incidents)
CREATE TABLE integration_incident_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    external_event_id UUID NOT NULL REFERENCES external_events(id),
    link_type VARCHAR(50), -- trigger, related, evidence, follow-up
    linked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    linked_by UUID REFERENCES users(id),
    
    CONSTRAINT unique_incident_event_link UNIQUE(incident_id, external_event_id)
);

CREATE INDEX idx_incident_links_incident ON integration_incident_links(incident_id);
CREATE INDEX idx_incident_links_event ON integration_incident_links(external_event_id);

-- System-specific event tables

-- Access Control Events
CREATE TABLE access_control_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_event_id UUID NOT NULL REFERENCES external_events(id) ON DELETE CASCADE,
    door_id VARCHAR(100),
    controller_id VARCHAR(100),
    credential_id VARCHAR(100),
    employee_id VARCHAR(100),
    event_result VARCHAR(50), -- granted, denied, forced, held-open
    access_method VARCHAR(50), -- card, biometric, pin, remote
    direction VARCHAR(20), -- entry, exit
    door_state VARCHAR(30),
    access_group_name VARCHAR(100),
    schedule_name VARCHAR(100),
    reason_code VARCHAR(50),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_access_events_external ON access_control_events(external_event_id);

-- Fire Alarm Events
CREATE TABLE fire_alarm_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_event_id UUID NOT NULL REFERENCES external_events(id) ON DELETE CASCADE,
    detector_id VARCHAR(100),
    panel_id VARCHAR(100),
    alarm_type VARCHAR(50), -- smoke, heat, manual, sprinkler, pump
    zone_name VARCHAR(100),
    alarm_state VARCHAR(30), -- activated, acknowledged, silenced, reset
    detector_type VARCHAR(50),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fire_events_external ON fire_alarm_events(external_event_id);

-- Intrusion Alarm Events
CREATE TABLE intrusion_alarm_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_event_id UUID NOT NULL REFERENCES external_events(id) ON DELETE CASCADE,
    sensor_id VARCHAR(100),
    panel_id VARCHAR(100),
    alarm_type VARCHAR(50), -- motion, glass-break, contact, shutter, perimeter, panic
    zone_name VARCHAR(100),
    armed_state VARCHAR(30),
    tamper_detected BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_intrusion_events_external ON intrusion_alarm_events(external_event_id);

-- ATM Monitoring Events
CREATE TABLE atm_monitoring_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_event_id UUID NOT NULL REFERENCES external_events(id) ON DELETE CASCADE,
    atm_id VARCHAR(100) NOT NULL,
    event_category VARCHAR(50), -- operational, security, transaction, maintenance
    transaction_id VARCHAR(100),
    cash_amount DECIMAL(12,2),
    card_number_masked VARCHAR(20),
    error_code VARCHAR(50),
    technician_id VARCHAR(100),
    work_order_id VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_atm_events_external ON atm_monitoring_events(external_event_id);
CREATE INDEX idx_atm_events_transaction ON atm_monitoring_events(transaction_id);

-- Branch Operational Events
CREATE TABLE branch_operational_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_event_id UUID NOT NULL REFERENCES external_events(id) ON DELETE CASCADE,
    operation_type VARCHAR(50), -- opening, closing, cash-movement, maintenance, schedule
    staff_id VARCHAR(100),
    shift_id VARCHAR(100),
    work_order_id VARCHAR(100),
    maintenance_window_start TIMESTAMP WITH TIME ZONE,
    maintenance_window_end TIMESTAMP WITH TIME ZONE,
    suppressed_alerts TEXT[],
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_branch_events_external ON branch_operational_events(external_event_id);

-- External Notifications (outbound to external systems)
CREATE TABLE external_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type VARCHAR(50) NOT NULL, -- police, emergency, central-monitoring, vendor
    recipient_system VARCHAR(100) NOT NULL,
    
    incident_id UUID REFERENCES incidents(id),
    external_event_id UUID REFERENCES external_events(id),
    
    priority VARCHAR(20), -- routine, urgent, emergency
    message_subject VARCHAR(200),
    message_body TEXT,
    attachments_json JSONB DEFAULT '[]',
    
    delivery_method VARCHAR(50), -- api, webhook, email, sms, secure-link
    delivery_status VARCHAR(30) DEFAULT 'pending', -- pending, sent, delivered, failed, acknowledged
    sent_at TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    external_reference VARCHAR(200),
    
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_external_notifications_incident ON external_notifications(incident_id);
CREATE INDEX idx_external_notifications_status ON external_notifications(delivery_status, created_at DESC);

-- Police Notifications (specific tracking for police communications)
CREATE TABLE police_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_notification_id UUID REFERENCES external_notifications(id) ON DELETE CASCADE,
    incident_id UUID NOT NULL REFERENCES incidents(id),
    
    police_station VARCHAR(200),
    contact_person VARCHAR(100),
    contact_number VARCHAR(20),
    
    notification_model VARCHAR(20), -- assisted, secure-message, dedicated-link
    approval_level VARCHAR(30), -- operator, supervisor, emergency-override
    
    police_reference_number VARCHAR(100),
    police_response_time TIMESTAMP WITH TIME ZONE,
    police_arrival_time TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_police_notifications_incident ON police_notifications(incident_id);

-- Secure Live Shares (temporary live video sharing)
CREATE TABLE secure_live_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_token VARCHAR(200) UNIQUE NOT NULL,
    incident_id UUID REFERENCES incidents(id),
    external_notification_id UUID REFERENCES external_notifications(id),
    
    recipient_organization VARCHAR(200) NOT NULL,
    recipient_contact VARCHAR(100),
    purpose TEXT NOT NULL,
    
    camera_ids UUID[] NOT NULL,
    allow_ptz BOOLEAN DEFAULT false,
    allow_historical BOOLEAN DEFAULT false,
    watermark_text VARCHAR(200),
    
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(id),
    revocation_reason TEXT,
    
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    access_log_json JSONB DEFAULT '[]',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_secure_shares_token ON secure_live_shares(share_token);
CREATE INDEX idx_secure_shares_active ON secure_live_shares(expires_at, revoked_at) WHERE revoked_at IS NULL;

-- Central Monitoring Station specific tables

-- Monitoring Operators
CREATE TABLE monitoring_operators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    operator_code VARCHAR(50) UNIQUE NOT NULL,
    skill_level VARCHAR(30), -- junior, senior, supervisor, specialist
    languages TEXT[],
    assigned_regions TEXT[],
    shift_pattern VARCHAR(50),
    max_concurrent_events INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Event Assignments (routing events to operators)
CREATE TABLE event_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_event_id UUID NOT NULL REFERENCES external_events(id),
    operator_id UUID NOT NULL REFERENCES monitoring_operators(id),
    
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    assigned_by_rule VARCHAR(100), -- auto-routing rule identifier
    priority_at_assignment VARCHAR(20),
    
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    started_handling_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    handling_duration_seconds INTEGER,
    response_sla_met BOOLEAN,
    
    escalated_to UUID REFERENCES monitoring_operators(id),
    escalated_at TIMESTAMP WITH TIME ZONE,
    escalation_reason TEXT,
    
    resolution_action VARCHAR(50), -- verified-false, verified-true, incident-created, forwarded
    operator_notes TEXT
);

CREATE INDEX idx_event_assignments_operator ON event_assignments(operator_id, assigned_at DESC);
CREATE INDEX idx_event_assignments_event ON event_assignments(external_event_id);
CREATE INDEX idx_event_assignments_pending ON event_assignments(completed_at) WHERE completed_at IS NULL;

-- Integration Audit Log
CREATE TABLE integration_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_type VARCHAR(50) NOT NULL, -- connection, authentication, event, mapping, rule, notification, credential, replay
    entity_type VARCHAR(50), -- connector, event, mapping, rule, notification, share
    entity_id UUID,
    
    action VARCHAR(50) NOT NULL, -- created, updated, deleted, enabled, disabled, sent, failed, acknowledged, replayed
    actor_id UUID REFERENCES users(id),
    actor_type VARCHAR(30), -- user, system, integration, scheduled
    
    details_json JSONB DEFAULT '{}',
    previous_values_json JSONB,
    new_values_json JSONB,
    
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_integration_audit_type ON integration_audit_log(audit_type, created_at DESC);
CREATE INDEX idx_integration_audit_entity ON integration_audit_log(entity_type, entity_id);
CREATE INDEX idx_integration_audit_actor ON integration_audit_log(actor_id, created_at DESC);

-- Add permissions
INSERT INTO permissions (name, description, category) VALUES
('integration:view', 'View integration connectors and events', 'integration'),
('integration:configure', 'Configure integration connectors', 'integration'),
('integration:test', 'Test integration connections', 'integration'),
('integration:disable', 'Disable integrations', 'integration'),
('integration:replay', 'Replay failed events', 'integration'),
('integration-mapping:view', 'View integration mappings', 'integration'),
('integration-mapping:manage', 'Manage integration mappings', 'integration'),
('integration-rule:view', 'View integration rules', 'integration'),
('integration-rule:manage', 'Manage integration rules', 'integration'),
('integration-rule:approve', 'Approve integration rules', 'integration'),
('external-event:view', 'View external events', 'integration'),
('external-event:export', 'Export external events', 'integration'),
('police-notification:create', 'Create police notifications', 'integration'),
('police-notification:approve', 'Approve police notifications', 'integration'),
('police-notification:view', 'View police notifications', 'integration'),
('secure-live-share:create', 'Create secure live shares', 'integration'),
('secure-live-share:revoke', 'Revoke secure live shares', 'integration');
