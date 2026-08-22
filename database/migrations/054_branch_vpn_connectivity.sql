-- A branch either uses its existing site-to-site VPN or a managed Cloudflare
-- tunnel. The profile records routing intent only; it never stores router VPN
-- credentials or camera/DVR passwords.

CREATE TABLE IF NOT EXISTS branch_connectivity_profiles (
  branch_node_id uuid PRIMARY KEY REFERENCES resource_nodes(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  primary_transport text NOT NULL CHECK (primary_transport IN ('vpn', 'cloudflare-tunnel')),
  fallback_transport text CHECK (fallback_transport IN ('vpn', 'cloudflare-tunnel')),
  vpn_protocol text CHECK (vpn_protocol IN ('ipsec', 'wireguard', 'openvpn', 'ssl-vpn')),
  vpn_remote_networks text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured', 'healthy', 'degraded', 'offline')),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fallback_transport IS NULL OR fallback_transport <> primary_transport),
  CHECK (
    (primary_transport <> 'vpn' AND COALESCE(fallback_transport, '') <> 'vpn')
    OR (vpn_protocol IS NOT NULL AND cardinality(vpn_remote_networks) > 0)
  )
);

CREATE INDEX IF NOT EXISTS branch_connectivity_profiles_tenant_status_idx
  ON branch_connectivity_profiles (tenant_id, status);

ALTER TABLE cameras
  ADD COLUMN IF NOT EXISTS connection_transport text
    CHECK (connection_transport IN ('vpn', 'cloudflare-tunnel'));

COMMENT ON TABLE branch_connectivity_profiles IS
  'Branch connectivity policy. VPN is router-owned; Cloudflare tunnel is gateway-owned.';
