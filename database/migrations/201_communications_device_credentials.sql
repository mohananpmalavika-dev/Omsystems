-- Persistent refresh-token state for zero-login communication devices.
-- Enrollment codes are looked up by the SHA-256 code_hash already defined in
-- migration 200; device credentials rotate atomically per device.
CREATE TABLE IF NOT EXISTS communication_device_credentials (
  device_id UUID PRIMARY KEY REFERENCES communication_devices(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_device_credentials_tenant
  ON communication_device_credentials(tenant_id);
