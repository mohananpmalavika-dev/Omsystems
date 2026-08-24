-- Keep the branch-local/VPN media address separate from the public tunnel.
-- The edge agent derives this address from the active network interfaces, so
-- it changes safely when DHCP/VPN addressing changes.
ALTER TABLE edge_agents
  ADD COLUMN IF NOT EXISTS local_media_url text;

