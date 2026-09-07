-- 102_investigation_workspace_persistence.sql
-- Production hardening: Persist full Investigation Workspace dossier to PostgreSQL (P0-08)

ALTER TABLE evidence_cases
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS incident_id uuid,
  ADD COLUMN IF NOT EXISTS lead_investigator text,
  ADD COLUMN IF NOT EXISTS assigned_users jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS camera_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS time_range_start timestamptz,
  ADD COLUMN IF NOT EXISTS time_range_end timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_package_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bookmarks jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sop_progress jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE INDEX IF NOT EXISTS evidence_cases_branch_idx ON evidence_cases (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS evidence_cases_incident_idx ON evidence_cases (incident_id);
