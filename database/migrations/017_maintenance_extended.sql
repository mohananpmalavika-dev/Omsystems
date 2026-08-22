-- Extended Maintenance Module Tables
-- Includes: plans, schedules, visits, health monitoring, firmware, spare parts, and reporting

CREATE TABLE IF NOT EXISTS maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  checklist_template jsonb,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maintenance_plans_tenant_idx ON maintenance_plans (tenant_id, status);

CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES maintenance_plans(id) ON DELETE CASCADE,
  branch_node_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES maintenance_assets(id) ON DELETE SET NULL,
  next_run_at timestamptz NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maintenance_schedules_tenant_idx ON maintenance_schedules (tenant_id, plan_id, status);
CREATE INDEX IF NOT EXISTS maintenance_schedules_next_run ON maintenance_schedules (tenant_id, next_run_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS maintenance_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES maintenance_schedules(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES users(id),
  due_at timestamptz NOT NULL,
  visited_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in-progress', 'completed', 'cancelled')),
  verification text,
  notes text,
  photos jsonb,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maintenance_visits_tenant_idx ON maintenance_visits (tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS maintenance_visits_assigned ON maintenance_visits (assigned_to, status);

CREATE TABLE IF NOT EXISTS maintenance_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  visit_id uuid NOT NULL REFERENCES maintenance_visits(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES maintenance_assets(id) ON DELETE SET NULL,
  category text NOT NULL,
  items jsonb NOT NULL,
  completed_items jsonb,
  observations text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed')),
  completed_at timestamptz,
  completed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maintenance_checklists_tenant_idx ON maintenance_checklists (tenant_id, visit_id);
CREATE INDEX IF NOT EXISTS maintenance_checklists_category_idx ON maintenance_checklists (asset_id, category);

-- Health Monitoring Tables

CREATE TABLE IF NOT EXISTS health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES maintenance_assets(id) ON DELETE CASCADE,
  check_type text NOT NULL,
  metric_name text NOT NULL,
  metric_value numeric,
  status text NOT NULL CHECK (status IN ('healthy', 'warning', 'critical', 'unknown')),
  threshold_warning numeric,
  threshold_critical numeric,
  details jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS health_checks_tenant_idx ON health_checks (tenant_id, check_type, status);
CREATE INDEX IF NOT EXISTS health_checks_asset_idx ON health_checks (asset_id, metric_name);
CREATE INDEX IF NOT EXISTS health_checks_recent ON health_checks (tenant_id, checked_at DESC) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS camera_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  online_status text NOT NULL CHECK (online_status IN ('online', 'offline', 'degraded')),
  fps numeric,
  bitrate numeric,
  stream_quality text,
  temperature numeric,
  tampering boolean DEFAULT false,
  recording_running boolean,
  latency_ms numeric,
  packet_loss numeric,
  last_frame_at timestamptz,
  last_check_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS camera_health_tenant_idx ON camera_health (tenant_id, camera_id);
CREATE INDEX IF NOT EXISTS camera_health_status_idx ON camera_health (online_status, last_check_at DESC);

CREATE TABLE IF NOT EXISTS storage_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES maintenance_assets(id) ON DELETE CASCADE,
  total_capacity_gb numeric,
  used_capacity_gb numeric,
  available_capacity_gb numeric,
  usage_percentage numeric,
  status text NOT NULL CHECK (status IN ('healthy', 'warning', 'critical')),
  smart_status text,
  temperature numeric,
  bad_sectors numeric,
  read_speed_mbs numeric,
  write_speed_mbs numeric,
  remaining_lifetime_years numeric,
  error_count numeric,
  last_check_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storage_health_tenant_idx ON storage_health (tenant_id, asset_id);
CREATE INDEX IF NOT EXISTS storage_health_status_idx ON storage_health (status, last_check_at DESC);

CREATE TABLE IF NOT EXISTS network_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES maintenance_assets(id) ON DELETE SET NULL,
  branch_node_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  check_type text NOT NULL,
  latency_ms numeric,
  packet_loss_percentage numeric,
  jitter_ms numeric,
  bandwidth_available_mbps numeric,
  rtsp_available boolean,
  onvif_available boolean,
  status text NOT NULL CHECK (status IN ('healthy', 'warning', 'critical')),
  last_check_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS network_health_tenant_idx ON network_health (tenant_id, check_type, status);
CREATE INDEX IF NOT EXISTS network_health_branch_idx ON network_health (branch_node_id, last_check_at DESC);

CREATE TABLE IF NOT EXISTS ups_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES maintenance_assets(id) ON DELETE CASCADE,
  battery_health_percentage numeric,
  runtime_minutes numeric,
  charging_status text,
  load_percentage numeric,
  temperature numeric,
  alarm_status text,
  last_self_test_at timestamptz,
  last_self_test_result text,
  status text NOT NULL CHECK (status IN ('healthy', 'warning', 'critical')),
  last_check_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ups_health_tenant_idx ON ups_health (tenant_id, asset_id);
CREATE INDEX IF NOT EXISTS ups_health_status_idx ON ups_health (status, last_check_at DESC);

-- Firmware & Software Management

CREATE TABLE IF NOT EXISTS firmware_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES maintenance_assets(id) ON DELETE CASCADE,
  device_type text NOT NULL,
  current_version text NOT NULL,
  latest_version text,
  available_versions jsonb,
  last_check_at timestamptz,
  requires_update boolean DEFAULT false,
  critical_update boolean DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS firmware_inventory_tenant_idx ON firmware_inventory (tenant_id, device_type, requires_update);
CREATE INDEX IF NOT EXISTS firmware_inventory_asset_idx ON firmware_inventory (asset_id);

CREATE TABLE IF NOT EXISTS software_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  component_name text NOT NULL,
  environment text NOT NULL,
  current_version text NOT NULL,
  previous_version text,
  upgrade_status text CHECK (upgrade_status IN ('pending', 'in-progress', 'completed', 'failed', 'rolled-back')),
  upgrade_approved_at timestamptz,
  upgrade_approved_by uuid REFERENCES users(id),
  upgrade_started_at timestamptz,
  upgrade_completed_at timestamptz,
  downtime_minutes numeric,
  rollback_available boolean DEFAULT true,
  rollback_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS software_versions_tenant_idx ON software_versions (tenant_id, component_name);
CREATE INDEX IF NOT EXISTS software_versions_upgrade_idx ON software_versions (upgrade_status, upgrade_approved_at);

-- Spare Parts Management

CREATE TABLE IF NOT EXISTS spare_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  part_name text NOT NULL,
  part_code text NOT NULL,
  category text NOT NULL,
  vendor_id uuid REFERENCES maintenance_vendors(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 0,
  reorder_level integer,
  unit_cost numeric,
  warranty_months integer,
  location text,
  branch_node_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spare_parts_tenant_idx ON spare_parts (tenant_id, category);
CREATE INDEX IF NOT EXISTS spare_parts_reorder_idx ON spare_parts (tenant_id) WHERE quantity <= reorder_level;

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('add', 'remove', 'used', 'damaged')),
  quantity integer NOT NULL,
  reference_number text,
  notes text,
  recorded_by uuid REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_transactions_part_idx ON inventory_transactions (part_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS inventory_transactions_workorder_idx ON inventory_transactions (work_order_id);

-- Predictive Maintenance

CREATE TABLE IF NOT EXISTS predictive_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES maintenance_assets(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  failure_probability numeric,
  estimated_failure_days integer,
  recommendation text,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  details jsonb,
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS predictive_alerts_tenant_idx ON predictive_alerts (tenant_id, status, severity);
CREATE INDEX IF NOT EXISTS predictive_alerts_asset_idx ON predictive_alerts (asset_id, detected_at DESC);

-- Maintenance Reports

CREATE TABLE IF NOT EXISTS maintenance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  branch_node_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES maintenance_assets(id) ON DELETE SET NULL,
  metrics jsonb,
  summary text,
  generated_by uuid REFERENCES users(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  filename text
);
CREATE INDEX IF NOT EXISTS maintenance_reports_tenant_idx ON maintenance_reports (tenant_id, report_type, period_end DESC);
CREATE INDEX IF NOT EXISTS maintenance_reports_branch_idx ON maintenance_reports (branch_node_id, period_end DESC);

-- Health Monitoring Views

CREATE OR REPLACE VIEW maintenance_asset_health_summary AS
SELECT
  ma.id,
  ma.tenant_id,
  ma.category,
  ma.asset_type,
  ma.serial_number,
  ma.model,
  ma.status,
  ma.branch_node_id,
  COALESCE(hc.status, 'unknown') AS health_status,
  COUNT(CASE WHEN hc.status = 'critical' THEN 1 END) AS critical_checks,
  MAX(hc.checked_at) AS last_check_at
FROM maintenance_assets ma
LEFT JOIN health_checks hc ON ma.id = hc.asset_id
GROUP BY ma.id, ma.tenant_id, ma.category, ma.asset_type, ma.serial_number, ma.model, ma.status, ma.branch_node_id, hc.status;

CREATE OR REPLACE VIEW maintenance_overdue_visits AS
SELECT
  mv.id,
  mv.tenant_id,
  mv.schedule_id,
  ms.branch_node_id,
  ms.asset_id,
  mv.assigned_to,
  mv.due_at,
  mv.status,
  (NOW() - mv.due_at) AS days_overdue
FROM maintenance_visits mv
LEFT JOIN maintenance_schedules ms ON mv.schedule_id = ms.id
WHERE mv.status IN ('pending', 'scheduled')
  AND mv.due_at < NOW()
ORDER BY mv.due_at ASC;

CREATE OR REPLACE VIEW maintenance_workorder_sla_status AS
SELECT
  wo.id,
  wo.tenant_id,
  wo.work_order_number,
  wo.severity,
  wo.status,
  wo.sla_due_at,
  CASE
    WHEN wo.status = 'closed' THEN 'completed'
    WHEN wo.sla_due_at > NOW() THEN 'on-track'
    ELSE 'breached'
  END AS sla_status,
  EXTRACT(EPOCH FROM (wo.sla_due_at - NOW())) / 3600 AS hours_remaining
FROM work_orders wo
WHERE wo.status NOT IN ('closed', 'resolved');

-- Trigger to update maintenance_assets status based on health_checks

CREATE OR REPLACE FUNCTION update_asset_health_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE maintenance_assets
  SET status = CASE
    WHEN EXISTS (SELECT 1 FROM health_checks WHERE asset_id = NEW.asset_id AND status = 'critical')
      THEN 'offline'
    WHEN EXISTS (SELECT 1 FROM health_checks WHERE asset_id = NEW.asset_id AND status = 'warning')
      THEN 'degraded'
    ELSE 'operational'
  END
  WHERE id = NEW.asset_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER health_check_asset_status
AFTER INSERT OR UPDATE ON health_checks
FOR EACH ROW
EXECUTE FUNCTION update_asset_health_status();
