-- An enrolled agent keeps its home branch and may serve additional VPN branches.
CREATE TABLE IF NOT EXISTS edge_agent_branch_assignments (
  edge_agent_id uuid NOT NULL REFERENCES edge_agents(id) ON DELETE CASCADE,
  branch_node_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  scope_node_id uuid NOT NULL REFERENCES resource_nodes(id),
  vpn_networks jsonb NOT NULL CHECK (jsonb_typeof(vpn_networks) = 'array' AND jsonb_array_length(vpn_networks) > 0),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (edge_agent_id, branch_node_id)
);
CREATE INDEX IF NOT EXISTS edge_agent_branch_assignments_branch_idx
  ON edge_agent_branch_assignments (branch_node_id, tenant_id);
