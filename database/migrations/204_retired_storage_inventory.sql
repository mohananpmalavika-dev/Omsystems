CREATE TABLE IF NOT EXISTS retired_storage_inventory (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  device_id text NOT NULL CHECK (length(device_id) BETWEEN 1 AND 200),
  retired_by text NOT NULL,
  retired_at timestamptz NOT NULL DEFAULT now(),
  registry_lifecycle_state text,
  PRIMARY KEY (tenant_id, branch_id, device_id)
);

COMMENT ON TABLE retired_storage_inventory IS
  'Branch-scoped storage devices removed from the active inventory while preserving telemetry history.';
