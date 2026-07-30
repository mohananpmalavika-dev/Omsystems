-- Device Inventory Table
-- Stores comprehensive device lifecycle and inventory information

CREATE TABLE IF NOT EXISTS device_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(200) NOT NULL,
  device_id VARCHAR(120) NOT NULL,
  tenant VARCHAR(200) NOT NULL,
  region VARCHAR(200) NOT NULL,
  branch VARCHAR(200) NOT NULL,
  device_type VARCHAR(100) NOT NULL,
  manufacturer VARCHAR(200) NOT NULL,
  model VARCHAR(200) NOT NULL,
  serial_number VARCHAR(200),
  mac_address VARCHAR(80),
  ip_address VARCHAR(100),
  firmware_version VARCHAR(200),
  onvif_version VARCHAR(100),
  capabilities JSONB DEFAULT '[]'::jsonb,
  credential_reference VARCHAR(500),
  installation_date VARCHAR(100),
  warranty VARCHAR(200),
  amc_contract VARCHAR(200),
  health_status VARCHAR(100) DEFAULT 'unknown',
  last_communication VARCHAR(100),
  configuration_template VARCHAR(200),
  risk_classification VARCHAR(100) DEFAULT 'medium',
  lifecycle_state VARCHAR(50) DEFAULT 'discovered',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT device_inventory_unique_device UNIQUE (tenant_id, device_id),
  CONSTRAINT device_inventory_lifecycle_state CHECK (lifecycle_state IN (
    'discovered', 'pending-approval', 'approved', 'configured', 
    'operational', 'maintenance', 'suspended', 'decommissioned'
  ))
);

CREATE INDEX IF NOT EXISTS idx_device_inventory_tenant ON device_inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_inventory_branch ON device_inventory(branch);
CREATE INDEX IF NOT EXISTS idx_device_inventory_lifecycle ON device_inventory(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_device_inventory_health ON device_inventory(health_status);
CREATE INDEX IF NOT EXISTS idx_device_inventory_device_type ON device_inventory(device_type);
