-- One remotely managed Cloudflare Tunnel per branch. Connector tokens are
-- deliberately never stored in PostgreSQL; they are fetched only when an
-- authenticated gateway requests its encrypted bootstrap configuration.

CREATE TABLE IF NOT EXISTS edge_managed_tunnels (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id uuid PRIMARY KEY REFERENCES resource_nodes(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('cloudflare')),
  provider_tunnel_id uuid NOT NULL UNIQUE,
  hostname text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN (
    'inactive', 'healthy', 'degraded', 'down', 'unknown', 'revoked'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS edge_managed_tunnels_tenant_status_idx
  ON edge_managed_tunnels (tenant_id, status);

COMMENT ON TABLE edge_managed_tunnels IS
  'Stable branch tunnel metadata. Cloudflare connector tokens are never persisted by Sentinel Grid.';
