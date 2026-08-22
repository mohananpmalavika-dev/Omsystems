ALTER TABLE operational_report_schedules
  ADD COLUMN IF NOT EXISTS template text NOT NULL DEFAULT 'comprehensive'
  CHECK (template IN ('comprehensive','branch_health_summary','camera_availability','alert_summary',
    'recorder_status','hdd_health','retention_compliance'));

ALTER TABLE operational_report_runs
  ADD COLUMN IF NOT EXISTS template text NOT NULL DEFAULT 'comprehensive'
  CHECK (template IN ('comprehensive','branch_health_summary','camera_availability','alert_summary',
    'recorder_status','hdd_health','retention_compliance'));

CREATE INDEX IF NOT EXISTS operational_report_runs_template_archive_idx
  ON operational_report_runs (tenant_id, template, created_at DESC);
