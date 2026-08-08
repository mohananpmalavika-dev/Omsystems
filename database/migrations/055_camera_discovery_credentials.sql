-- Branch credentials are centrally managed and delivered only to an authenticated
-- edge agent during a discovery run. The scanner never receives a database URL.

CREATE TABLE IF NOT EXISTS camera_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  edge_agent_id uuid REFERENCES edge_agents(id) ON DELETE SET NULL,
  ip_address text,
  username text NOT NULL,
  password text NOT NULL,
  scope text NOT NULL DEFAULT 'default' CHECK (scope IN ('default', 'host-specific')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS camera_credentials_branch_host_idx
  ON camera_credentials (branch_id, ip_address, updated_at DESC);
