-- Device Management System: Credentials, Jobs, IPAM, Templates, and Drift Detection
-- Migration: 0120_device_management.sql

-- ============================================================
-- DEVICE CREDENTIALS
-- ============================================================
-- Stores encrypted device credentials with versioning and rotation tracking

CREATE TABLE device_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  device_id UUID NOT NULL REFERENCES device_inventory(id),
  credential_version INTEGER NOT NULL DEFAULT 1,
  username TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,  -- AES-256-GCM encrypted: <version>:<iv>:<tag>:<ciphertext>
  encryption_key_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ,
  replaces_credential_id UUID REFERENCES device_credentials(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotating', 'superseded', 'revoked')),
  UNIQUE(device_id, credential_version)
);

CREATE INDEX idx_device_credentials_device ON device_credentials(device_id, status);
CREATE INDEX idx_device_credentials_tenant ON device_credentials(tenant_id);
CREATE INDEX idx_device_credentials_status ON device_credentials(status) WHERE status = 'active';

COMMENT ON TABLE device_credentials IS 'Encrypted device credentials with versioning';
COMMENT ON COLUMN device_credentials.encrypted_secret IS 'AES-256-GCM encrypted password - never store plaintext';
COMMENT ON COLUMN device_credentials.status IS 'active: current credential, rotating: in progress, superseded: old version, revoked: invalidated';

-- ============================================================
-- DEVICE CONFIGURATION JOBS
-- ============================================================
-- Async job queue for device configuration operations

CREATE TABLE device_configuration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  device_id UUID NOT NULL REFERENCES device_inventory(id),
  edge_agent_id UUID REFERENCES edge_agents(id),
  job_type TEXT NOT NULL CHECK (job_type IN (
    'credential-rotation', 'ip-change', 'template-apply', 
    'firmware-upgrade', 'reboot', 'configuration-sync'
  )),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'claimed', 'precheck', 'connecting', 'applying',
    'waiting-reboot', 'verifying', 'completed', 'failed', 
    'rolling-back', 'manual-intervention'
  )),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  requested_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  payload JSONB NOT NULL,
  result JSONB,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  claimed_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_jobs_device ON device_configuration_jobs(device_id);
CREATE INDEX idx_device_jobs_status ON device_configuration_jobs(status, next_attempt_at) 
  WHERE status IN ('queued', 'failed');
CREATE INDEX idx_device_jobs_edge_agent ON device_configuration_jobs(edge_agent_id, status);
CREATE INDEX idx_device_jobs_tenant ON device_configuration_jobs(tenant_id, created_at DESC);

COMMENT ON TABLE device_configuration_jobs IS 'Async job queue for device configuration operations';
COMMENT ON COLUMN device_configuration_jobs.payload IS 'Job-specific parameters (credentialId, ipAddress, templateId, etc.)';
COMMENT ON COLUMN device_configuration_jobs.result IS 'Job execution result and verification details';

-- ============================================================
-- DEVICE JOB STEPS
-- ============================================================
-- Tracks individual steps within a configuration job

CREATE TABLE device_job_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES device_configuration_jobs(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  result JSONB,
  error TEXT,
  UNIQUE(job_id, step_number)
);

CREATE INDEX idx_device_job_steps_job ON device_job_steps(job_id, step_number);

COMMENT ON TABLE device_job_steps IS 'Individual steps within configuration jobs for granular tracking';


-- ============================================================
-- BRANCH NETWORKS (IPAM)
-- ============================================================
-- Network configuration per branch for IP address management

CREATE TABLE branch_networks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID NOT NULL REFERENCES resource_nodes(id),
  network_cidr CIDR NOT NULL,
  gateway INET NOT NULL,
  dns_servers TEXT[],
  vlan_id INTEGER,
  dhcp_range_start INET,
  dhcp_range_end INET,
  reserved_range_start INET,
  reserved_range_end INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(branch_id, network_cidr)
);

CREATE INDEX idx_branch_networks_branch ON branch_networks(branch_id);
CREATE INDEX idx_branch_networks_tenant ON branch_networks(tenant_id);

COMMENT ON TABLE branch_networks IS 'IP Address Management (IPAM) - Network configuration per branch';
COMMENT ON COLUMN branch_networks.reserved_range_start IS 'Start of static IP range for devices';
COMMENT ON COLUMN branch_networks.reserved_range_end IS 'End of static IP range for devices';

-- ============================================================
-- IP ADDRESS ASSIGNMENTS
-- ============================================================
-- Tracks IP address assignments to devices with conflict detection

CREATE TABLE ip_address_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID NOT NULL REFERENCES resource_nodes(id),
  device_id UUID NOT NULL REFERENCES device_inventory(id),
  ip_address INET NOT NULL,
  mac_address MACADDR,
  subnet_cidr CIDR NOT NULL,
  reservation_type TEXT NOT NULL CHECK (reservation_type IN ('static', 'dhcp-reservation', 'dynamic')),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'pending', 'conflict', 'released')),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  UNIQUE(branch_id, ip_address)
);

CREATE INDEX idx_ip_assignments_device ON ip_address_assignments(device_id);
CREATE INDEX idx_ip_assignments_branch ON ip_address_assignments(branch_id, status);
CREATE INDEX idx_ip_assignments_ip ON ip_address_assignments(ip_address);

COMMENT ON TABLE ip_address_assignments IS 'IP address assignments with conflict detection and verification';
COMMENT ON COLUMN ip_address_assignments.status IS 'assigned: active, pending: waiting verification, conflict: duplicate detected, released: freed';

-- ============================================================
-- DEVICE TEMPLATES
-- ============================================================
-- Configuration templates for consistent device provisioning

CREATE TABLE device_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN (
    'camera-configuration', 'recording', 'analytics', 'privacy',
    'network', 'security-hardening', 'location'
  )),
  category TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  settings JSONB NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'deprecated')),
  UNIQUE(tenant_id, name, version)
);

CREATE INDEX idx_device_templates_tenant ON device_templates(tenant_id, status);
CREATE INDEX idx_device_templates_type ON device_templates(template_type, status);

COMMENT ON TABLE device_templates IS 'Configuration templates for consistent device provisioning';
COMMENT ON COLUMN device_templates.settings IS 'Template configuration with variable substitution support';


-- ============================================================
-- DEVICE TEMPLATE ASSIGNMENTS
-- ============================================================
-- Tracks which templates are assigned to which devices

CREATE TABLE device_template_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  device_id UUID NOT NULL REFERENCES device_inventory(id),
  template_id UUID NOT NULL REFERENCES device_templates(id),
  template_version INTEGER NOT NULL,
  applied_by UUID REFERENCES users(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
    'pending', 'verified', 'drifted', 'failed'
  )),
  verified_at TIMESTAMPTZ,
  UNIQUE(device_id, template_id)
);

CREATE INDEX idx_template_assignments_device ON device_template_assignments(device_id);
CREATE INDEX idx_template_assignments_template ON device_template_assignments(template_id);
CREATE INDEX idx_template_assignments_verification ON device_template_assignments(verification_status) 
  WHERE verification_status = 'drifted';

COMMENT ON TABLE device_template_assignments IS 'Tracks template assignments and drift detection status';

-- ============================================================
-- DEVICE CONFIGURATION DRIFT
-- ============================================================
-- Detects when actual device config differs from desired template

CREATE TABLE device_configuration_drift (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  device_id UUID NOT NULL REFERENCES device_inventory(id),
  template_id UUID REFERENCES device_templates(id),
  drift_type TEXT NOT NULL,
  desired_value JSONB,
  actual_value JSONB,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX idx_drift_device ON device_configuration_drift(device_id, acknowledged);
CREATE INDEX idx_drift_template ON device_configuration_drift(template_id, acknowledged);
CREATE INDEX idx_drift_detected ON device_configuration_drift(detected_at DESC);

COMMENT ON TABLE device_configuration_drift IS 'Configuration drift detection between desired and actual device state';
COMMENT ON COLUMN device_configuration_drift.drift_type IS 'e.g., video.bitrate, network.ip, security.onvif';

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to get current active credential for a device
CREATE OR REPLACE FUNCTION get_device_current_credential(p_device_id UUID)
RETURNS device_credentials AS $$
  SELECT * FROM device_credentials
  WHERE device_id = p_device_id
    AND status = 'active'
  ORDER BY credential_version DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Function to check for IP conflicts
CREATE OR REPLACE FUNCTION check_ip_conflict(p_branch_id UUID, p_ip_address INET, p_exclude_device_id UUID DEFAULT NULL)
RETURNS TABLE (device_id UUID, device_name TEXT, ip_address INET, mac_address MACADDR) AS $$
  SELECT 
    ia.device_id,
    di.device_id AS device_name,
    ia.ip_address,
    ia.mac_address
  FROM ip_address_assignments ia
  JOIN device_inventory di ON ia.device_id = di.id
  WHERE ia.branch_id = p_branch_id
    AND ia.ip_address = p_ip_address
    AND ia.status IN ('assigned', 'pending')
    AND (p_exclude_device_id IS NULL OR ia.device_id != p_exclude_device_id);
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- INITIAL DATA
-- ============================================================

-- Insert default device management permissions into rbac_permissions if not exists
INSERT INTO rbac_permissions (name, description, category, created_at)
VALUES
  ('device:view', 'View device details', 'device-management', NOW()),
  ('device:list', 'List devices', 'device-management', NOW()),
  ('device:credentials:rotate', 'Rotate device credentials', 'device-management', NOW()),
  ('device:network:change', 'Change device network settings', 'device-management', NOW()),
  ('device:template:create', 'Create configuration templates', 'device-management', NOW()),
  ('device:template:publish', 'Publish templates for use', 'device-management', NOW()),
  ('device:template:apply', 'Apply templates to devices', 'device-management', NOW()),
  ('device:configuration:apply', 'Apply configuration changes', 'device-management', NOW()),
  ('device:configuration:rollback', 'Rollback configuration', 'device-management', NOW()),
  ('device:bulk:configure', 'Perform bulk configuration operations', 'device-management', NOW()),
  ('device:firmware:upgrade', 'Upgrade device firmware', 'device-management', NOW()),
  ('device:factory-reset', 'Factory reset device', 'device-management', NOW())
ON CONFLICT (name) DO NOTHING;

COMMENT ON SCHEMA public IS 'Device Management System v1.0 - Production Ready';
