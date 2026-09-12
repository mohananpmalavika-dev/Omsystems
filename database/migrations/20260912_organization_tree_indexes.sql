-- Organization tree reads filter by tenant and active state, then assemble
-- parent/child relationships in application memory.
CREATE INDEX IF NOT EXISTS resource_nodes_tenant_active_parent_idx
  ON resource_nodes (tenant_id, is_active, parent_id);

CREATE INDEX IF NOT EXISTS resource_nodes_tenant_path_idx
  ON resource_nodes (tenant_id, path);