ALTER TABLE cameras
  ADD COLUMN profiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN capabilities jsonb NOT NULL DEFAULT
    '{"ptz": false, "audio": false, "events": false}'::jsonb;

CREATE TYPE edge_agent_status AS ENUM ('pending', 'online', 'offline');
CREATE TYPE discovery_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE edge_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_node_id uuid NOT NULL REFERENCES resource_nodes(id),
  name text NOT NULL,
  version text NOT NULL,
  status edge_agent_status NOT NULL DEFAULT 'pending',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX edge_agents_branch_idx ON edge_agents (branch_node_id);
CREATE INDEX edge_agents_health_idx ON edge_agents (status, last_seen_at);

CREATE TABLE camera_discoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_node_id uuid NOT NULL REFERENCES resource_nodes(id),
  edge_agent_id uuid NOT NULL REFERENCES edge_agents(id),
  vendor text NOT NULL,
  model text NOT NULL,
  ip_address inet NOT NULL,
  onvif_port integer NOT NULL CHECK (onvif_port BETWEEN 1 AND 65535),
  rtsp_port integer NOT NULL CHECK (rtsp_port BETWEEN 1 AND 65535),
  profiles jsonb NOT NULL,
  capabilities jsonb NOT NULL,
  status discovery_status NOT NULL DEFAULT 'pending',
  discovered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edge_agent_id, ip_address, onvif_port)
);

CREATE INDEX camera_discoveries_branch_status_idx
  ON camera_discoveries (branch_node_id, status);

CREATE TABLE live_sessions (
  id uuid PRIMARY KEY,
  camera_id uuid NOT NULL REFERENCES cameras(id),
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX live_sessions_expiry_idx ON live_sessions (expires_at)
  WHERE consumed_at IS NULL;

-- Only a SHA-256 hash is persisted. The one-time bearer token is returned once
-- to the authorized client and expires after sixty seconds.
