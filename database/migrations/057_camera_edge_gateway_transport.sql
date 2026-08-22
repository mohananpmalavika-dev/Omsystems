-- Camera source reachability is independent of the branch control uplink.
-- A branch gateway can read a camera/DVR on the local LAN while its control
-- plane and event traffic travel over an existing site-to-site VPN.

ALTER TABLE cameras
  DROP CONSTRAINT IF EXISTS cameras_connection_transport_check;

ALTER TABLE cameras
  ADD CONSTRAINT cameras_connection_transport_check
  CHECK (connection_transport IN ('vpn', 'cloudflare-tunnel', 'edge-gateway'));
