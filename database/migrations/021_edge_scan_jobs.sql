CREATE TYPE edge_scan_status AS ENUM ('queued', 'running', 'completed', 'failed');

ALTER TABLE edge_agents ADD COLUMN public_media_url text;
ALTER TABLE cameras ADD COLUMN edge_agent_id uuid REFERENCES edge_agents(id);

CREATE TABLE edge_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_node_id uuid NOT NULL REFERENCES resource_nodes(id),
  edge_agent_id uuid NOT NULL REFERENCES edge_agents(id),
  status edge_scan_status NOT NULL DEFAULT 'queued',
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  result_count integer NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  error text
);

CREATE INDEX edge_scan_jobs_agent_queue_idx
  ON edge_scan_jobs (edge_agent_id, requested_at)
  WHERE status = 'queued';

CREATE INDEX edge_scan_jobs_branch_idx
  ON edge_scan_jobs (branch_node_id, requested_at DESC);

CREATE INDEX cameras_edge_agent_idx ON cameras (edge_agent_id);
