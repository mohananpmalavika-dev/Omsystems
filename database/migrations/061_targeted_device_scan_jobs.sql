-- Credential verification must never trigger another branch-wide discovery.
-- A device-scoped job carries only the selected pending discovery address to
-- the edge agent. Branch provisioning continues to use the default scope.
ALTER TABLE edge_scan_jobs
  ADD COLUMN IF NOT EXISTS scan_scope text NOT NULL DEFAULT 'branch'
    CHECK (scan_scope IN ('branch', 'device')),
  ADD COLUMN IF NOT EXISTS target_discovery_id uuid
    REFERENCES camera_discoveries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_ip_address inet,
  ADD COLUMN IF NOT EXISTS target_onvif_port integer
    CHECK (target_onvif_port IS NULL OR target_onvif_port BETWEEN 1 AND 65535);

CREATE INDEX IF NOT EXISTS edge_scan_jobs_target_idx
  ON edge_scan_jobs (edge_agent_id, target_ip_address, requested_at DESC)
  WHERE scan_scope = 'device';
