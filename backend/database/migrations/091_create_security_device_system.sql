-- =====================================================
-- Unified Physical Security Device System Schema
-- Banking-grade integration for CCTV, access control, intrusion,
-- fire safety, ATM security, vault monitoring, and power systems
-- =====================================================

-- =====================================================
-- Security Devices Table
-- Core registry of all physical security devices
-- =====================================================
CREATE TABLE IF NOT EXISTS security_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant and location isolation
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    
    -- Device identification
    type VARCHAR(100) NOT NULL, -- CAMERA, NVR, DOOR, PANIC_BUTTON, FIRE_SENSOR, ATM, VAULT, UPS, etc.
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Hardware information
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    serial_number VARCHAR(255),
    firmware_version VARCHAR(100),
    hardware_version VARCHAR(100),
    
    -- Network configuration
    ip_address INET,
    mac_address MACADDR,
    port INTEGER,
    protocol VARCHAR(50) NOT NULL, -- ONVIF, RTSP, SNMP, MQTT, REST, MODBUS_TCP, etc.
    
    -- Status and health
    status VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN', -- ONLINE, OFFLINE, DEGRADED, ALARM, MAINTENANCE, etc.
    health VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN', -- EXCELLENT, GOOD, FAIR, POOR, CRITICAL
    last_seen_at TIMESTAMPTZ,
    last_health_check_at TIMESTAMPTZ,
    
    -- Capabilities (stored as JSONB array)
    capabilities JSONB NOT NULL DEFAULT '[]', -- ["VIEW", "HEALTH_READ", "PTZ", "LOCK", "UNLOCK", etc.]
    
    -- Device relationships
    parent_device_id UUID REFERENCES security_devices(id) ON DELETE SET NULL,
    controller_device_id UUID REFERENCES security_devices(id) ON DELETE SET NULL,
    
    -- Digital Twin integration
    digital_twin_object_id UUID,
    
    -- Device-specific metadata
    metadata JSONB DEFAULT '{}',
    
    -- Credential reference (never store actual credentials)
    credential_ref_id VARCHAR(255),
    
    -- Configuration
    polling_interval_seconds INTEGER DEFAULT 60,
    event_buffer_size INTEGER DEFAULT 1000,
    auto_discovered BOOLEAN NOT NULL DEFAULT false,
    enrollment_status VARCHAR(50) NOT NULL DEFAULT 'DISCOVERED', 
        -- DISCOVERED, PENDING_REVIEW, APPROVED, PROVISIONING, ACTIVE, REJECTED
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    
    CONSTRAINT fk_security_devices_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_security_devices_branch FOREIGN KEY (branch_id) 
        REFERENCES branches(id) ON DELETE CASCADE,
    CONSTRAINT fk_security_devices_created_by FOREIGN KEY (created_by) 
        REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_security_devices_updated_by FOREIGN KEY (updated_by) 
        REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for efficient queries
CREATE INDEX idx_security_devices_tenant_branch ON security_devices(tenant_id, branch_id);
CREATE INDEX idx_security_devices_type ON security_devices(tenant_id, type);
CREATE INDEX idx_security_devices_status ON security_devices(tenant_id, status);
CREATE INDEX idx_security_devices_health ON security_devices(tenant_id, health);
CREATE INDEX idx_security_devices_enrollment ON security_devices(tenant_id, enrollment_status);
CREATE INDEX idx_security_devices_parent ON security_devices(parent_device_id) WHERE parent_device_id IS NOT NULL;
CREATE INDEX idx_security_devices_controller ON security_devices(controller_device_id) WHERE controller_device_id IS NOT NULL;
CREATE INDEX idx_security_devices_twin ON security_devices(digital_twin_object_id) WHERE digital_twin_object_id IS NOT NULL;
CREATE INDEX idx_security_devices_ip ON security_devices(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX idx_security_devices_serial ON security_devices(serial_number) WHERE serial_number IS NOT NULL;

-- =====================================================
-- Device Health Snapshots
-- Periodic health metrics for trending and prediction
-- =====================================================
CREATE TABLE IF NOT EXISTS security_device_health_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    device_id UUID NOT NULL REFERENCES security_devices(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    
    -- Overall health
    health VARCHAR(50) NOT NULL, -- EXCELLENT, GOOD, FAIR, POOR, CRITICAL
    health_score NUMERIC(5,2) NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
    
    -- Connectivity metrics
    is_online BOOLEAN NOT NULL,
    response_time_ms INTEGER,
    packet_loss_percent NUMERIC(5,2),
    signal_strength_dbm INTEGER,
    
    -- Device-specific metrics
    cpu_usage_percent NUMERIC(5,2),
    memory_usage_percent NUMERIC(5,2),
    storage_usage_percent NUMERIC(5,2),
    temperature_celsius NUMERIC(5,2),
    
    -- Power metrics
    power_status VARCHAR(50), -- AC, BATTERY, GENERATOR, UNKNOWN
    battery_level_percent NUMERIC(5,2),
    battery_voltage NUMERIC(6,2),
    ups_runtime_minutes INTEGER,
    
    -- Error tracking
    error_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    last_error_message TEXT,
    last_error_at TIMESTAMPTZ,
    
    -- Maintenance indicators
    uptime_seconds BIGINT,
    last_reboot_at TIMESTAMPTZ,
    last_maintenance_at TIMESTAMPTZ,
    next_maintenance_due TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timing
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_health_snapshots_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_health_snapshots_branch FOREIGN KEY (branch_id) 
        REFERENCES branches(id) ON DELETE CASCADE
);

-- Partitioning strategy: partition by month for performance
-- CREATE TABLE security_device_health_snapshots_y2024m01 PARTITION OF security_device_health_snapshots
--     FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE INDEX idx_health_snapshots_device ON security_device_health_snapshots(device_id, captured_at DESC);
CREATE INDEX idx_health_snapshots_tenant ON security_device_health_snapshots(tenant_id, captured_at DESC);
CREATE INDEX idx_health_snapshots_branch ON security_device_health_snapshots(branch_id, captured_at DESC);
CREATE INDEX idx_health_snapshots_health ON security_device_health_snapshots(tenant_id, health, captured_at DESC);
CREATE INDEX idx_health_snapshots_time ON security_device_health_snapshots(captured_at DESC);

-- =====================================================
-- Security Device Events
-- All events from security devices (access, alarm, fire, etc.)
-- =====================================================
CREATE TABLE IF NOT EXISTS security_device_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    device_id UUID NOT NULL REFERENCES security_devices(id) ON DELETE CASCADE,
    
    -- Event classification
    event_type VARCHAR(100) NOT NULL, -- DOOR_FORCED_OPEN, PANIC_BUTTON_PRESSED, FIRE_ALARM_TRIGGERED, etc.
    severity VARCHAR(10) NOT NULL, -- P0, P1, P2, P3, P4, INFO
    category VARCHAR(50) NOT NULL, -- ACCESS, ALARM, FIRE, BANKING, POWER, NETWORK, MAINTENANCE, OTHER
    
    -- Event details
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Timing (device time vs. platform time)
    occurred_at TIMESTAMPTZ NOT NULL, -- When event happened on device
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- When platform received it
    processed_at TIMESTAMPTZ,
    
    -- Context
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    credential VARCHAR(255), -- Reference to credential used (never actual value)
    location VARCHAR(255),
    
    -- Correlation
    correlation_id UUID, -- Group related events
    parent_event_id UUID REFERENCES security_device_events(id) ON DELETE SET NULL,
    incident_id UUID, -- Link to correlated incident
    
    -- Processing status
    processed BOOLEAN NOT NULL DEFAULT false,
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    
    -- Event data
    payload JSONB NOT NULL DEFAULT '{}', -- Raw event data
    normalized_payload JSONB, -- Parsed/normalized data
    
    -- Media attachments
    snapshot_url TEXT,
    video_url TEXT,
    attached_camera_ids JSONB DEFAULT '[]', -- Array of camera IDs
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_device_events_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_device_events_branch FOREIGN KEY (branch_id) 
        REFERENCES branches(id) ON DELETE CASCADE
);

-- Partitioning strategy: partition by week or month
-- CREATE TABLE security_device_events_y2024w01 PARTITION OF security_device_events
--     FOR VALUES FROM ('2024-01-01') TO ('2024-01-08');

CREATE INDEX idx_device_events_device ON security_device_events(device_id, occurred_at DESC);
CREATE INDEX idx_device_events_tenant ON security_device_events(tenant_id, occurred_at DESC);
CREATE INDEX idx_device_events_branch ON security_device_events(branch_id, occurred_at DESC);
CREATE INDEX idx_device_events_type ON security_device_events(tenant_id, event_type, occurred_at DESC);
CREATE INDEX idx_device_events_severity ON security_device_events(tenant_id, severity, occurred_at DESC);
CREATE INDEX idx_device_events_category ON security_device_events(tenant_id, category, occurred_at DESC);
CREATE INDEX idx_device_events_processed ON security_device_events(processed, occurred_at DESC) WHERE processed = false;
CREATE INDEX idx_device_events_acknowledged ON security_device_events(acknowledged, occurred_at DESC) WHERE acknowledged = false;
CREATE INDEX idx_device_events_correlation ON security_device_events(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_device_events_incident ON security_device_events(incident_id) WHERE incident_id IS NOT NULL;
CREATE INDEX idx_device_events_user ON security_device_events(user_id) WHERE user_id IS NOT NULL;

-- =====================================================
-- Device Commands
-- Tracks device control operations (lock, unlock, reboot, etc.)
-- =====================================================
CREATE TABLE IF NOT EXISTS security_device_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    device_id UUID NOT NULL REFERENCES security_devices(id) ON DELETE CASCADE,
    
    -- Command details
    command VARCHAR(100) NOT NULL, -- LOCK, UNLOCK, REBOOT, ARM, DISARM, etc.
    parameters JSONB DEFAULT '{}',
    
    -- Authorization
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    requires_mfa BOOLEAN NOT NULL DEFAULT false,
    reason TEXT,
    
    -- Execution status
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, EXECUTING, COMPLETED, FAILED, REJECTED, TIMEOUT
    result JSONB,
    error_message TEXT,
    
    -- Timing
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    timeout_seconds INTEGER NOT NULL DEFAULT 300,
    
    -- Audit trail
    audit_log JSONB DEFAULT '[]', -- Array of {timestamp, action, performedBy, details}
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_device_commands_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_device_commands_branch FOREIGN KEY (branch_id) 
        REFERENCES branches(id) ON DELETE CASCADE
);

CREATE INDEX idx_device_commands_device ON security_device_commands(device_id, requested_at DESC);
CREATE INDEX idx_device_commands_tenant ON security_device_commands(tenant_id, requested_at DESC);
CREATE INDEX idx_device_commands_status ON security_device_commands(status, requested_at DESC);
CREATE INDEX idx_device_commands_requested_by ON security_device_commands(requested_by, requested_at DESC);
CREATE INDEX idx_device_commands_pending_approval ON security_device_commands(status, requested_at DESC) 
    WHERE status = 'PENDING' AND requires_approval = true;

-- =====================================================
-- Device Relationships
-- Hierarchical device structures (NVR->Cameras, Controller->Doors, etc.)
-- =====================================================
CREATE TABLE IF NOT EXISTS security_device_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    parent_device_id UUID NOT NULL REFERENCES security_devices(id) ON DELETE CASCADE,
    child_device_id UUID NOT NULL REFERENCES security_devices(id) ON DELETE CASCADE,
    
    relationship_type VARCHAR(50) NOT NULL, -- PHYSICAL_CONNECTION, LOGICAL_CONTROL, DATA_FLOW, POWER_SUPPLY, NETWORK_DEPENDENCY
    
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(parent_device_id, child_device_id, relationship_type)
);

CREATE INDEX idx_device_relationships_parent ON security_device_relationships(parent_device_id);
CREATE INDEX idx_device_relationships_child ON security_device_relationships(child_device_id);
CREATE INDEX idx_device_relationships_type ON security_device_relationships(relationship_type);

-- =====================================================
-- Device Integrations
-- Integration configurations for different device protocols/vendors
-- =====================================================
CREATE TABLE IF NOT EXISTS security_device_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Integration type
    integration_type VARCHAR(50) NOT NULL, -- DIRECT, EDGE_GATEWAY, CLOUD_BRIDGE, VENDOR_API
    
    -- Adapter configuration
    adapter_name VARCHAR(100) NOT NULL,
    adapter_version VARCHAR(50) NOT NULL,
    protocol VARCHAR(50) NOT NULL,
    
    -- Connection details (credentials stored separately)
    connection_config JSONB NOT NULL DEFAULT '{}',
    credential_ref_id VARCHAR(255),
    
    -- Integration health
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, ERROR, MAINTENANCE
    last_sync_at TIMESTAMPTZ,
    last_error_at TIMESTAMPTZ,
    last_error_message TEXT,
    
    -- Settings
    polling_interval_seconds INTEGER NOT NULL DEFAULT 60,
    auto_reconnect BOOLEAN NOT NULL DEFAULT true,
    max_retries INTEGER NOT NULL DEFAULT 3,
    
    -- Statistics
    devices_managed INTEGER NOT NULL DEFAULT 0,
    events_processed_today INTEGER NOT NULL DEFAULT 0,
    total_events_processed BIGINT NOT NULL DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    CONSTRAINT fk_device_integrations_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_device_integrations_tenant ON security_device_integrations(tenant_id);
CREATE INDEX idx_device_integrations_status ON security_device_integrations(tenant_id, status);
CREATE INDEX idx_device_integrations_adapter ON security_device_integrations(adapter_name, adapter_version);

-- =====================================================
-- Device Discovery Jobs
-- Track device discovery/scanning operations
-- =====================================================
CREATE TABLE IF NOT EXISTS security_device_discovery_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    branch_id UUID,
    
    -- Discovery parameters
    network_range VARCHAR(100), -- e.g., 192.168.1.0/24
    scan_type VARCHAR(50) NOT NULL, -- QUICK, DEEP, SCHEDULED
    include_device_types JSONB DEFAULT '[]',
    exclude_device_types JSONB DEFAULT '[]',
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, RUNNING, COMPLETED, FAILED
    progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    
    -- Results
    devices_discovered INTEGER NOT NULL DEFAULT 0,
    devices_enrolled INTEGER NOT NULL DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- Error tracking
    error_message TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    CONSTRAINT fk_discovery_jobs_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_discovery_jobs_branch FOREIGN KEY (branch_id) 
        REFERENCES branches(id) ON DELETE CASCADE
);

CREATE INDEX idx_discovery_jobs_tenant ON security_device_discovery_jobs(tenant_id, created_at DESC);
CREATE INDEX idx_discovery_jobs_branch ON security_device_discovery_jobs(branch_id, created_at DESC) WHERE branch_id IS NOT NULL;
CREATE INDEX idx_discovery_jobs_status ON security_device_discovery_jobs(status, created_at DESC);

-- =====================================================
-- Discovered Devices (Temporary staging table)
-- Devices found but not yet enrolled
-- =====================================================
CREATE TABLE IF NOT EXISTS security_discovered_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    branch_id UUID,
    discovery_job_id UUID REFERENCES security_device_discovery_jobs(id) ON DELETE CASCADE,
    
    -- Device information from discovery
    ip_address INET NOT NULL,
    mac_address MACADDR,
    port INTEGER,
    device_type VARCHAR(100),
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    serial_number VARCHAR(255),
    firmware_version VARCHAR(100),
    protocol VARCHAR(50) NOT NULL,
    
    -- Discovery metadata
    capabilities JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confidence NUMERIC(5,2) NOT NULL, -- 0-100: confidence in device identification
    
    -- Enrollment tracking
    enrollment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_REVIEW', -- PENDING_REVIEW, APPROVED, REJECTED, ENROLLED
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    enrolled_device_id UUID REFERENCES security_devices(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_discovered_devices_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_discovered_devices_branch FOREIGN KEY (branch_id) 
        REFERENCES branches(id) ON DELETE CASCADE
);

CREATE INDEX idx_discovered_devices_tenant ON security_discovered_devices(tenant_id, discovered_at DESC);
CREATE INDEX idx_discovered_devices_branch ON security_discovered_devices(branch_id, discovered_at DESC) WHERE branch_id IS NOT NULL;
CREATE INDEX idx_discovered_devices_job ON security_discovered_devices(discovery_job_id);
CREATE INDEX idx_discovered_devices_enrollment ON security_discovered_devices(enrollment_status, discovered_at DESC);
CREATE INDEX idx_discovered_devices_ip ON security_discovered_devices(ip_address);

-- =====================================================
-- Correlated Security Incidents
-- AI-powered correlation of multi-device events
-- =====================================================
CREATE TABLE IF NOT EXISTS correlated_security_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    
    -- Incident classification
    incident_type VARCHAR(100) NOT NULL,
    severity VARCHAR(10) NOT NULL, -- P0, P1, P2, P3, P4
    confidence NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100), -- AI confidence
    
    -- Incident details
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    ai_summary TEXT,
    
    -- Involved devices and events
    device_ids JSONB NOT NULL DEFAULT '[]', -- Array of device IDs
    event_ids JSONB NOT NULL DEFAULT '[]', -- Array of event IDs
    primary_event_id UUID REFERENCES security_device_events(id) ON DELETE SET NULL,
    
    -- Timeline
    first_event_at TIMESTAMPTZ NOT NULL,
    last_event_at TIMESTAMPTZ NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Response status
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, ACKNOWLEDGED, INVESTIGATING, RESOLVED, FALSE_POSITIVE
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Evidence
    attached_camera_ids JSONB DEFAULT '[]',
    snapshot_urls JSONB DEFAULT '[]',
    video_urls JSONB DEFAULT '[]',
    evidence_package_url TEXT,
    
    -- Actions log
    actions_log JSONB DEFAULT '[]', -- Array of {timestamp, action, performedBy, details}
    
    -- Escalation
    escalation_level INTEGER NOT NULL DEFAULT 0,
    escalated_to JSONB DEFAULT '[]', -- Array of user IDs
    notifications_sent INTEGER NOT NULL DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_correlated_incidents_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_correlated_incidents_branch FOREIGN KEY (branch_id) 
        REFERENCES branches(id) ON DELETE CASCADE
);

CREATE INDEX idx_correlated_incidents_tenant ON correlated_security_incidents(tenant_id, detected_at DESC);
CREATE INDEX idx_correlated_incidents_branch ON correlated_security_incidents(branch_id, detected_at DESC);
CREATE INDEX idx_correlated_incidents_severity ON correlated_security_incidents(tenant_id, severity, detected_at DESC);
CREATE INDEX idx_correlated_incidents_status ON correlated_security_incidents(tenant_id, status, detected_at DESC);
CREATE INDEX idx_correlated_incidents_type ON correlated_security_incidents(tenant_id, incident_type, detected_at DESC);
CREATE INDEX idx_correlated_incidents_active ON correlated_security_incidents(status, detected_at DESC) 
    WHERE status IN ('ACTIVE', 'ACKNOWLEDGED', 'INVESTIGATING');

-- =====================================================
-- Branch Security Posture (Materialized aggregate view)
-- Real-time security status for each branch
-- =====================================================
CREATE TABLE IF NOT EXISTS branch_security_posture (
    branch_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    
    -- Overall status
    overall_status VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN', -- NORMAL, WARNING, CRITICAL, EMERGENCY
    security_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (security_score >= 0 AND security_score <= 100),
    
    -- Device category summaries (stored as JSONB for flexibility)
    cctv_status JSONB NOT NULL DEFAULT '{}',
    access_control_status JSONB NOT NULL DEFAULT '{}',
    intrusion_status JSONB NOT NULL DEFAULT '{}',
    fire_status JSONB NOT NULL DEFAULT '{}',
    banking_status JSONB NOT NULL DEFAULT '{}',
    power_status JSONB NOT NULL DEFAULT '{}',
    network_status JSONB NOT NULL DEFAULT '{}',
    
    -- Active issues
    active_alarms INTEGER NOT NULL DEFAULT 0,
    critical_issues INTEGER NOT NULL DEFAULT 0,
    warnings INTEGER NOT NULL DEFAULT 0,
    
    -- Correlation insights
    correlated_incidents INTEGER NOT NULL DEFAULT 0,
    ai_insights JSONB DEFAULT '[]',
    
    -- Metadata
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    
    CONSTRAINT fk_branch_posture_tenant FOREIGN KEY (tenant_id) 
        REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_branch_posture_branch FOREIGN KEY (branch_id) 
        REFERENCES branches(id) ON DELETE CASCADE
);

CREATE INDEX idx_branch_posture_tenant ON branch_security_posture(tenant_id, overall_status);
CREATE INDEX idx_branch_posture_score ON branch_security_posture(tenant_id, security_score DESC);
CREATE INDEX idx_branch_posture_status ON branch_security_posture(overall_status, last_updated DESC);

-- =====================================================
-- Views for Monitoring and Analytics
-- =====================================================

-- Active security devices by type and status
CREATE OR REPLACE VIEW v_security_device_summary AS
SELECT 
    tenant_id,
    branch_id,
    type,
    status,
    health,
    COUNT(*) as device_count,
    COUNT(*) FILTER (WHERE status = 'ONLINE') as online_count,
    COUNT(*) FILTER (WHERE status = 'OFFLINE') as offline_count,
    COUNT(*) FILTER (WHERE status = 'ALARM') as alarm_count,
    AVG(CASE 
        WHEN health = 'EXCELLENT' THEN 95
        WHEN health = 'GOOD' THEN 80
        WHEN health = 'FAIR' THEN 60
        WHEN health = 'POOR' THEN 40
        WHEN health = 'CRITICAL' THEN 20
        ELSE 0
    END) as avg_health_score
FROM security_devices
WHERE enrollment_status = 'ACTIVE'
GROUP BY tenant_id, branch_id, type, status, health;

-- Recent unprocessed security events
CREATE OR REPLACE VIEW v_unprocessed_security_events AS
SELECT 
    e.id,
    e.tenant_id,
    e.branch_id,
    e.device_id,
    d.name as device_name,
    d.type as device_type,
    e.event_type,
    e.severity,
    e.category,
    e.title,
    e.occurred_at,
    e.received_at,
    e.acknowledged
FROM security_device_events e
JOIN security_devices d ON d.id = e.device_id
WHERE e.processed = false
ORDER BY e.severity, e.occurred_at DESC;

-- Active correlated incidents needing attention
CREATE OR REPLACE VIEW v_active_security_incidents AS
SELECT 
    i.id,
    i.tenant_id,
    i.branch_id,
    b.name as branch_name,
    i.incident_type,
    i.severity,
    i.confidence,
    i.title,
    i.status,
    i.escalation_level,
    jsonb_array_length(i.device_ids) as device_count,
    jsonb_array_length(i.event_ids) as event_count,
    i.detected_at,
    i.acknowledged_at,
    NOW() - i.detected_at as age
FROM correlated_security_incidents i
JOIN branches b ON b.id = i.branch_id
WHERE i.status IN ('ACTIVE', 'ACKNOWLEDGED', 'INVESTIGATING')
ORDER BY 
    CASE i.severity
        WHEN 'P0' THEN 1
        WHEN 'P1' THEN 2
        WHEN 'P2' THEN 3
        WHEN 'P3' THEN 4
        ELSE 5
    END,
    i.detected_at DESC;

-- Device health degradation trends
CREATE OR REPLACE VIEW v_device_health_trends AS
SELECT 
    device_id,
    tenant_id,
    branch_id,
    DATE_TRUNC('hour', captured_at) as hour,
    AVG(health_score) as avg_health_score,
    MIN(health_score) as min_health_score,
    MAX(health_score) as max_health_score,
    AVG(response_time_ms) as avg_response_time_ms,
    AVG(packet_loss_percent) as avg_packet_loss_percent,
    SUM(error_count) as total_errors,
    SUM(warning_count) as total_warnings
FROM security_device_health_snapshots
WHERE captured_at >= NOW() - INTERVAL '24 hours'
GROUP BY device_id, tenant_id, branch_id, DATE_TRUNC('hour', captured_at)
ORDER BY hour DESC;

-- High-risk device commands requiring approval
CREATE OR REPLACE VIEW v_pending_device_commands AS
SELECT 
    c.id,
    c.tenant_id,
    c.branch_id,
    c.device_id,
    d.name as device_name,
    d.type as device_type,
    c.command,
    c.parameters,
    c.requested_by,
    u.email as requested_by_email,
    c.requires_approval,
    c.requires_mfa,
    c.reason,
    c.status,
    c.requested_at,
    NOW() - c.requested_at as pending_duration
FROM security_device_commands c
JOIN security_devices d ON d.id = c.device_id
JOIN users u ON u.id = c.requested_by
WHERE c.status = 'PENDING' AND c.requires_approval = true
ORDER BY c.requested_at;

-- =====================================================
-- Functions
-- =====================================================

-- Update branch security posture (called periodically or on device changes)
CREATE OR REPLACE FUNCTION update_branch_security_posture(p_branch_id UUID)
RETURNS VOID AS $$
DECLARE
    v_tenant_id UUID;
    v_cctv_data JSONB;
    v_access_data JSONB;
    v_intrusion_data JSONB;
    v_fire_data JSONB;
    v_banking_data JSONB;
    v_power_data JSONB;
    v_network_data JSONB;
    v_active_alarms INTEGER;
    v_critical_issues INTEGER;
    v_warnings INTEGER;
    v_correlated_incidents INTEGER;
    v_overall_status VARCHAR(50);
    v_security_score NUMERIC(5,2);
BEGIN
    -- Get tenant ID
    SELECT tenant_id INTO v_tenant_id FROM branches WHERE id = p_branch_id;
    
    -- Calculate CCTV status
    SELECT jsonb_build_object(
        'totalDevices', COUNT(*),
        'onlineDevices', COUNT(*) FILTER (WHERE status = 'ONLINE'),
        'offlineDevices', COUNT(*) FILTER (WHERE status = 'OFFLINE'),
        'degradedDevices', COUNT(*) FILTER (WHERE status = 'DEGRADED'),
        'alarmDevices', COUNT(*) FILTER (WHERE status = 'ALARM'),
        'healthScore', AVG(CASE 
            WHEN health = 'EXCELLENT' THEN 95
            WHEN health = 'GOOD' THEN 80
            WHEN health = 'FAIR' THEN 60
            WHEN health = 'POOR' THEN 40
            WHEN health = 'CRITICAL' THEN 20
            ELSE 0
        END),
        'status', CASE 
            WHEN COUNT(*) FILTER (WHERE status = 'ALARM') > 0 THEN 'CRITICAL'
            WHEN COUNT(*) FILTER (WHERE status = 'OFFLINE') > COUNT(*) * 0.2 THEN 'WARNING'
            ELSE 'NORMAL'
        END
    ) INTO v_cctv_data
    FROM security_devices
    WHERE branch_id = p_branch_id 
      AND type IN ('CAMERA', 'NVR', 'DVR')
      AND enrollment_status = 'ACTIVE';
    
    -- Calculate Access Control status
    SELECT jsonb_build_object(
        'totalDevices', COUNT(*),
        'onlineDevices', COUNT(*) FILTER (WHERE status = 'ONLINE'),
        'offlineDevices', COUNT(*) FILTER (WHERE status = 'OFFLINE'),
        'degradedDevices', COUNT(*) FILTER (WHERE status = 'DEGRADED'),
        'alarmDevices', COUNT(*) FILTER (WHERE status = 'ALARM'),
        'healthScore', AVG(CASE 
            WHEN health = 'EXCELLENT' THEN 95
            WHEN health = 'GOOD' THEN 80
            WHEN health = 'FAIR' THEN 60
            WHEN health = 'POOR' THEN 40
            WHEN health = 'CRITICAL' THEN 20
            ELSE 0
        END),
        'status', CASE 
            WHEN COUNT(*) FILTER (WHERE status = 'ALARM') > 0 THEN 'CRITICAL'
            WHEN COUNT(*) FILTER (WHERE status = 'OFFLINE') > COUNT(*) * 0.1 THEN 'WARNING'
            ELSE 'NORMAL'
        END
    ) INTO v_access_data
    FROM security_devices
    WHERE branch_id = p_branch_id 
      AND type IN ('ACCESS_CONTROLLER', 'DOOR', 'DOOR_LOCK', 'CARD_READER', 'BIOMETRIC_READER')
      AND enrollment_status = 'ACTIVE';
    
    -- Calculate Intrusion status
    SELECT jsonb_build_object(
        'totalDevices', COUNT(*),
        'onlineDevices', COUNT(*) FILTER (WHERE status = 'ONLINE'),
        'offlineDevices', COUNT(*) FILTER (WHERE status = 'OFFLINE'),
        'degradedDevices', COUNT(*) FILTER (WHERE status = 'DEGRADED'),
        'alarmDevices', COUNT(*) FILTER (WHERE status = 'ALARM'),
        'healthScore', AVG(CASE 
            WHEN health = 'EXCELLENT' THEN 95
            WHEN health = 'GOOD' THEN 80
            WHEN health = 'FAIR' THEN 60
            WHEN health = 'POOR' THEN 40
            WHEN health = 'CRITICAL' THEN 20
            ELSE 0
        END),
        'status', CASE 
            WHEN COUNT(*) FILTER (WHERE status = 'ALARM') > 0 THEN 'CRITICAL'
            WHEN COUNT(*) FILTER (WHERE status = 'OFFLINE') > 0 THEN 'WARNING'
            ELSE 'NORMAL'
        END
    ) INTO v_intrusion_data
    FROM security_devices
    WHERE branch_id = p_branch_id 
      AND type IN ('INTRUSION_PANEL', 'PANIC_BUTTON', 'MOTION_SENSOR', 'GLASS_BREAK_SENSOR')
      AND enrollment_status = 'ACTIVE';
    
    -- Calculate Fire & Safety status
    SELECT jsonb_build_object(
        'totalDevices', COUNT(*),
        'onlineDevices', COUNT(*) FILTER (WHERE status = 'ONLINE'),
        'offlineDevices', COUNT(*) FILTER (WHERE status = 'OFFLINE'),
        'degradedDevices', COUNT(*) FILTER (WHERE status = 'DEGRADED'),
        'alarmDevices', COUNT(*) FILTER (WHERE status = 'ALARM'),
        'healthScore', AVG(CASE 
            WHEN health = 'EXCELLENT' THEN 95
            WHEN health = 'GOOD' THEN 80
            WHEN health = 'FAIR' THEN 60
            WHEN health = 'POOR' THEN 40
            WHEN health = 'CRITICAL' THEN 20
            ELSE 0
        END),
        'status', CASE 
            WHEN COUNT(*) FILTER (WHERE status = 'ALARM') > 0 THEN 'CRITICAL'
            WHEN COUNT(*) FILTER (WHERE status = 'OFFLINE') > 0 THEN 'WARNING'
            ELSE 'NORMAL'
        END
    ) INTO v_fire_data
    FROM security_devices
    WHERE branch_id = p_branch_id 
      AND type IN ('FIRE_PANEL', 'FIRE_SENSOR', 'SMOKE_DETECTOR', 'HEAT_DETECTOR')
      AND enrollment_status = 'ACTIVE';
    
    -- Calculate Banking-specific status
    SELECT jsonb_build_object(
        'totalDevices', COUNT(*),
        'onlineDevices', COUNT(*) FILTER (WHERE status = 'ONLINE'),
        'offlineDevices', COUNT(*) FILTER (WHERE status = 'OFFLINE'),
        'degradedDevices', COUNT(*) FILTER (WHERE status = 'DEGRADED'),
        'alarmDevices', COUNT(*) FILTER (WHERE status = 'ALARM'),
        'healthScore', AVG(CASE 
            WHEN health = 'EXCELLENT' THEN 95
            WHEN health = 'GOOD' THEN 80
            WHEN health = 'FAIR' THEN 60
            WHEN health = 'POOR' THEN 40
            WHEN health = 'CRITICAL' THEN 20
            ELSE 0
        END),
        'status', CASE 
            WHEN COUNT(*) FILTER (WHERE status = 'ALARM') > 0 THEN 'CRITICAL'
            WHEN COUNT(*) FILTER (WHERE status = 'OFFLINE') > 0 THEN 'WARNING'
            ELSE 'NORMAL'
        END
    ) INTO v_banking_data
    FROM security_devices
    WHERE branch_id = p_branch_id 
      AND type IN ('ATM', 'VAULT', 'VAULT_DOOR', 'SAFE', 'CASH_COUNTER')
      AND enrollment_status = 'ACTIVE';
    
    -- Calculate Power status
    SELECT jsonb_build_object(
        'totalDevices', COUNT(*),
        'onlineDevices', COUNT(*) FILTER (WHERE status = 'ONLINE'),
        'offlineDevices', COUNT(*) FILTER (WHERE status = 'OFFLINE'),
        'degradedDevices', COUNT(*) FILTER (WHERE status = 'DEGRADED'),
        'alarmDevices', COUNT(*) FILTER (WHERE status = 'ALARM'),
        'healthScore', AVG(CASE 
            WHEN health = 'EXCELLENT' THEN 95
            WHEN health = 'GOOD' THEN 80
            WHEN health = 'FAIR' THEN 60
            WHEN health = 'POOR' THEN 40
            WHEN health = 'CRITICAL' THEN 20
            ELSE 0
        END),
        'status', CASE 
            WHEN COUNT(*) FILTER (WHERE status = 'ALARM') > 0 THEN 'CRITICAL'
            WHEN COUNT(*) FILTER (WHERE status = 'DEGRADED') > 0 THEN 'WARNING'
            ELSE 'NORMAL'
        END
    ) INTO v_power_data
    FROM security_devices
    WHERE branch_id = p_branch_id 
      AND type IN ('UPS', 'POWER_SUPPLY', 'GENERATOR')
      AND enrollment_status = 'ACTIVE';
    
    -- Calculate Network status
    SELECT jsonb_build_object(
        'totalDevices', COUNT(*),
        'onlineDevices', COUNT(*) FILTER (WHERE status = 'ONLINE'),
        'offlineDevices', COUNT(*) FILTER (WHERE status = 'OFFLINE'),
        'degradedDevices', COUNT(*) FILTER (WHERE status = 'DEGRADED'),
        'alarmDevices', COUNT(*) FILTER (WHERE status = 'ALARM'),
        'healthScore', AVG(CASE 
            WHEN health = 'EXCELLENT' THEN 95
            WHEN health = 'GOOD' THEN 80
            WHEN health = 'FAIR' THEN 60
            WHEN health = 'POOR' THEN 40
            WHEN health = 'CRITICAL' THEN 20
            ELSE 0
        END),
        'status', CASE 
            WHEN COUNT(*) FILTER (WHERE status = 'OFFLINE') > COUNT(*) * 0.2 THEN 'CRITICAL'
            WHEN COUNT(*) FILTER (WHERE status = 'DEGRADED') > 0 THEN 'WARNING'
            ELSE 'NORMAL'
        END
    ) INTO v_network_data
    FROM security_devices
    WHERE branch_id = p_branch_id 
      AND type IN ('NETWORK_SWITCH', 'ROUTER', 'EDGE_GATEWAY')
      AND enrollment_status = 'ACTIVE';
    
    -- Count active issues
    SELECT 
        COUNT(*) FILTER (WHERE status = 'ALARM'),
        COUNT(*) FILTER (WHERE health = 'CRITICAL' OR status = 'OFFLINE'),
        COUNT(*) FILTER (WHERE health IN ('POOR', 'FAIR') OR status = 'DEGRADED')
    INTO v_active_alarms, v_critical_issues, v_warnings
    FROM security_devices
    WHERE branch_id = p_branch_id AND enrollment_status = 'ACTIVE';
    
    -- Count correlated incidents
    SELECT COUNT(*) INTO v_correlated_incidents
    FROM correlated_security_incidents
    WHERE branch_id = p_branch_id 
      AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'INVESTIGATING');
    
    -- Determine overall status
    IF v_active_alarms > 0 OR v_correlated_incidents > 0 THEN
        v_overall_status := 'EMERGENCY';
    ELSIF v_critical_issues > 5 THEN
        v_overall_status := 'CRITICAL';
    ELSIF v_warnings > 10 THEN
        v_overall_status := 'WARNING';
    ELSE
        v_overall_status := 'NORMAL';
    END IF;
    
    -- Calculate security score (0-100)
    SELECT AVG(CASE 
        WHEN health = 'EXCELLENT' THEN 95
        WHEN health = 'GOOD' THEN 80
        WHEN health = 'FAIR' THEN 60
        WHEN health = 'POOR' THEN 40
        WHEN health = 'CRITICAL' THEN 20
        ELSE 0
    END) INTO v_security_score
    FROM security_devices
    WHERE branch_id = p_branch_id AND enrollment_status = 'ACTIVE';
    
    -- Apply penalties
    v_security_score := v_security_score - (v_active_alarms * 10) - (v_critical_issues * 5) - (v_warnings * 2);
    v_security_score := GREATEST(v_security_score, 0);
    v_security_score := LEAST(v_security_score, 100);
    
    -- Upsert branch security posture
    INSERT INTO branch_security_posture (
        branch_id,
        tenant_id,
        overall_status,
        security_score,
        cctv_status,
        access_control_status,
        intrusion_status,
        fire_status,
        banking_status,
        power_status,
        network_status,
        active_alarms,
        critical_issues,
        warnings,
        correlated_incidents,
        last_updated
    ) VALUES (
        p_branch_id,
        v_tenant_id,
        v_overall_status,
        v_security_score,
        COALESCE(v_cctv_data, '{}'),
        COALESCE(v_access_data, '{}'),
        COALESCE(v_intrusion_data, '{}'),
        COALESCE(v_fire_data, '{}'),
        COALESCE(v_banking_data, '{}'),
        COALESCE(v_power_data, '{}'),
        COALESCE(v_network_data, '{}'),
        v_active_alarms,
        v_critical_issues,
        v_warnings,
        v_correlated_incidents,
        NOW()
    )
    ON CONFLICT (branch_id) DO UPDATE SET
        overall_status = EXCLUDED.overall_status,
        security_score = EXCLUDED.security_score,
        cctv_status = EXCLUDED.cctv_status,
        access_control_status = EXCLUDED.access_control_status,
        intrusion_status = EXCLUDED.intrusion_status,
        fire_status = EXCLUDED.fire_status,
        banking_status = EXCLUDED.banking_status,
        power_status = EXCLUDED.power_status,
        network_status = EXCLUDED.network_status,
        active_alarms = EXCLUDED.active_alarms,
        critical_issues = EXCLUDED.critical_issues,
        warnings = EXCLUDED.warnings,
        correlated_incidents = EXCLUDED.correlated_incidents,
        last_updated = EXCLUDED.last_updated;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update posture on device changes
CREATE OR REPLACE FUNCTION trigger_update_branch_posture()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM update_branch_security_posture(OLD.branch_id);
    ELSE
        PERFORM update_branch_security_posture(NEW.branch_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_security_device_posture_update
AFTER INSERT OR UPDATE OF status, health OR DELETE ON security_devices
FOR EACH ROW
EXECUTE FUNCTION trigger_update_branch_posture();

-- Clean up old health snapshots
CREATE OR REPLACE FUNCTION cleanup_old_health_snapshots(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    DELETE FROM security_device_health_snapshots
    WHERE captured_at < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up old device events
CREATE OR REPLACE FUNCTION cleanup_old_device_events(retention_days INTEGER DEFAULT 180)
RETURNS INTEGER AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    DELETE FROM security_device_events
    WHERE occurred_at < NOW() - (retention_days || ' days')::INTERVAL
      AND processed = true
      AND acknowledged = true;
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE security_devices IS 'Core registry of all physical security devices';
COMMENT ON TABLE security_device_health_snapshots IS 'Periodic health metrics for device monitoring and prediction';
COMMENT ON TABLE security_device_events IS 'All security events from devices (access, alarm, fire, banking, etc.)';
COMMENT ON TABLE security_device_commands IS 'Device control operations with RBAC and audit trail';
COMMENT ON TABLE security_device_relationships IS 'Hierarchical device structures and dependencies';
COMMENT ON TABLE security_device_integrations IS 'Integration configurations for different protocols/vendors';
COMMENT ON TABLE security_device_discovery_jobs IS 'Device discovery/scanning job tracking';
COMMENT ON TABLE security_discovered_devices IS 'Staging table for discovered devices awaiting enrollment';
COMMENT ON TABLE correlated_security_incidents IS 'AI-powered multi-device incident correlation';
COMMENT ON TABLE branch_security_posture IS 'Real-time aggregate security status per branch';

-- =====================================================
-- Scheduled Jobs (using pg_cron if available)
-- =====================================================

-- Update all branch postures every 5 minutes
-- SELECT cron.schedule('update-branch-postures', '*/5 * * * *', 
--     'SELECT update_branch_security_posture(id) FROM branches');

-- Clean up old health snapshots weekly
-- SELECT cron.schedule('cleanup-health-snapshots', '0 3 * * 0', 
--     'SELECT cleanup_old_health_snapshots(90)');

-- Clean up old device events monthly
-- SELECT cron.schedule('cleanup-device-events', '0 4 1 * *', 
--     'SELECT cleanup_old_device_events(180)');
