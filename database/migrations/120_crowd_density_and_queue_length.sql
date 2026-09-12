-- ============================================================================
-- Migration 120: Crowd Density & Queue Length Detection Hardening (analytics.crowd)
--
-- Authoritative schema for branch hall crowd density estimation, spatial heatmap
-- clustering, counter queue depth tracking, and SLA threshold monitoring.
-- ============================================================================

-- 1. Master table for crowd monitoring zones (branch halls, waiting areas, lobbies)
CREATE TABLE IF NOT EXISTS crowd_monitoring_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  zone_name text NOT NULL,
  zone_type text NOT NULL CHECK (zone_type IN (
    'branch_hall',
    'waiting_lounge',
    'atm_vestibule',
    'teller_area',
    'kiosk_zone',
    'entrance_foyer',
    'corridor'
  )),
  polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  area_sqm numeric(8,2) NOT NULL DEFAULT 50.0 CHECK (area_sqm > 0),
  nominal_capacity integer NOT NULL DEFAULT 20 CHECK (nominal_capacity >= 1),
  warning_capacity integer NOT NULL DEFAULT 35 CHECK (warning_capacity >= nominal_capacity),
  max_capacity integer NOT NULL DEFAULT 50 CHECK (max_capacity >= warning_capacity),
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crowd_zones_tenant
  ON crowd_monitoring_zones (tenant_id);

CREATE INDEX IF NOT EXISTS idx_crowd_zones_branch
  ON crowd_monitoring_zones (tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_crowd_zones_camera
  ON crowd_monitoring_zones (camera_id);

-- 2. Master table for teller counter queues (service counters, cash desks)
CREATE TABLE IF NOT EXISTS counter_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  counter_number text NOT NULL,
  counter_name text NOT NULL,
  counter_type text NOT NULL CHECK (counter_type IN (
    'cash_deposit',
    'cash_withdrawal',
    'general_teller',
    'forex_remittance',
    'loan_desk',
    'account_services',
    'customer_support'
  )),
  queue_polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  service_station_polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_queue_length_threshold integer NOT NULL DEFAULT 5 CHECK (max_queue_length_threshold >= 1),
  max_wait_time_seconds_threshold integer NOT NULL DEFAULT 300 CHECK (max_wait_time_seconds_threshold >= 30),
  alert_severity text NOT NULL DEFAULT 'P2' CHECK (alert_severity IN ('P1', 'P2', 'P3')),
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counter_queues_tenant
  ON counter_queues (tenant_id);

CREATE INDEX IF NOT EXISTS idx_counter_queues_branch
  ON counter_queues (tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_counter_queues_camera
  ON counter_queues (camera_id);

-- 3. Time-series ledger for crowd density audit snapshots
CREATE TABLE IF NOT EXISTS crowd_density_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES crowd_monitoring_zones(id) ON DELETE CASCADE,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  person_count integer NOT NULL DEFAULT 0 CHECK (person_count >= 0),
  density_level text NOT NULL CHECK (density_level IN (
    'empty',
    'sparse',
    'normal',
    'crowded',
    'overcrowded',
    'dangerous'
  )),
  occupancy_percentage numeric(6,2) NOT NULL DEFAULT 0.0,
  density_per_sqm numeric(6,3) NOT NULL DEFAULT 0.0,
  average_speed numeric(6,3) NOT NULL DEFAULT 0.0,
  is_bottleneck boolean NOT NULL DEFAULT false,
  heat_intensity numeric(4,3) NOT NULL DEFAULT 0.0 CHECK (heat_intensity BETWEEN 0.0 AND 1.0),
  trend text NOT NULL DEFAULT 'stable' CHECK (trend IN ('increasing', 'decreasing', 'stable')),
  snapshot_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  timestamp timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crowd_snapshots_tenant_time
  ON crowd_density_snapshots (tenant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_crowd_snapshots_zone_time
  ON crowd_density_snapshots (zone_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_crowd_snapshots_branch_time
  ON crowd_density_snapshots (branch_id, timestamp DESC);

-- 4. Time-series ledger for counter queue depth & SLA snapshots
CREATE TABLE IF NOT EXISTS counter_queue_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  queue_id uuid REFERENCES counter_queues(id) ON DELETE CASCADE,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  current_queue_length integer NOT NULL DEFAULT 0 CHECK (current_queue_length >= 0),
  served_person_count integer NOT NULL DEFAULT 0 CHECK (served_person_count >= 0),
  avg_wait_time_seconds integer NOT NULL DEFAULT 0 CHECK (avg_wait_time_seconds >= 0),
  max_wait_time_seconds integer NOT NULL DEFAULT 0 CHECK (max_wait_time_seconds >= 0),
  is_counter_attended boolean NOT NULL DEFAULT true,
  threshold_exceeded boolean NOT NULL DEFAULT false,
  bottleneck_detected boolean NOT NULL DEFAULT false,
  participant_track_ids text[] NOT NULL DEFAULT '{}',
  snapshot_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  timestamp timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_snapshots_tenant_time
  ON counter_queue_snapshots (tenant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_queue_snapshots_queue_time
  ON counter_queue_snapshots (queue_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_queue_snapshots_branch_time
  ON counter_queue_snapshots (branch_id, timestamp DESC);

-- 5. Authoritative crowd & queue operational incident records
CREATE TABLE IF NOT EXISTS crowd_queue_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  incident_type text NOT NULL CHECK (incident_type IN (
    'crowd_density_exceeded',
    'queue_length_exceeded',
    'wait_time_sla_breach',
    'unattended_counter_with_queue',
    'stampede_risk_bottleneck'
  )),
  severity text NOT NULL CHECK (severity IN ('P1', 'P2', 'P3')),
  entity_type text NOT NULL CHECK (entity_type IN ('zone', 'counter_queue')),
  entity_id uuid NOT NULL,
  entity_name text NOT NULL,
  trigger_value numeric(8,2) NOT NULL,
  threshold_value numeric(8,2) NOT NULL,
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  explanation text NOT NULL,
  snapshot_url text,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'acknowledged', 'resolved', 'false_positive')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolution_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crowd_incidents_tenant_time
  ON crowd_queue_incidents (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_crowd_incidents_branch_time
  ON crowd_queue_incidents (branch_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_crowd_incidents_status
  ON crowd_queue_incidents (tenant_id, review_status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_crowd_incidents_severity
  ON crowd_queue_incidents (tenant_id, severity, occurred_at DESC);

-- 6. System & tenant configuration overrides for crowd & queue analytics
CREATE TABLE IF NOT EXISTS crowd_queue_configs (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  default_queue_threshold integer NOT NULL DEFAULT 5 CHECK (default_queue_threshold >= 1),
  default_wait_time_threshold_seconds integer NOT NULL DEFAULT 300 CHECK (default_wait_time_threshold_seconds >= 30),
  density_warning_percentage integer NOT NULL DEFAULT 70 CHECK (density_warning_percentage >= 20),
  density_critical_percentage integer NOT NULL DEFAULT 90 CHECK (density_critical_percentage >= density_warning_percentage),
  bottleneck_speed_threshold numeric(4,2) NOT NULL DEFAULT 0.15,
  sla_target_compliance_percentage numeric(5,2) NOT NULL DEFAULT 95.0,
  alert_cooldown_seconds integer NOT NULL DEFAULT 60 CHECK (alert_cooldown_seconds >= 10),
  auto_recommend_extra_counters boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crowd_configs_tenant
  ON crowd_queue_configs (tenant_id);

-- 7. Audit Table Comments
COMMENT ON TABLE crowd_monitoring_zones IS
  'Monitored branch hall zones, lobbies, and customer waiting areas with defined spatial polygon boundaries and capacity limits.';
COMMENT ON TABLE counter_queues IS
  'Branch teller and service counters configured with queue line geometry, service stations, and SLA thresholds.';
COMMENT ON TABLE crowd_density_snapshots IS
  'Authoritative time-series telemetry snapshots of hall crowd size, spatial density, velocity, and congestion trends.';
COMMENT ON TABLE counter_queue_snapshots IS
  'Time-series queue metrics documenting queue lengths, wait time distributions, and teller attendance status.';
COMMENT ON TABLE crowd_queue_incidents IS
  'Authoritative incident ledger for crowd overflow, counter queue threshold breaches, and customer wait time SLA violations.';
COMMENT ON TABLE crowd_queue_configs IS
  'Tenant and branch-level default threshold policies, SLA criteria, and counter auto-dispatch configurations.';
