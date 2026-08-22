-- =====================================================
-- Branch Operational Health Cache
-- =====================================================
-- 
-- Canonical branch operational health state cache.
-- This is the single source of truth for branch health displayed
-- in the HO dashboard, mosaic, reports, and Digital Twin.
--
-- Replaces multiple disparate health calculations with one
-- canonical model driven by rule-based evaluation.
--

-- Branch Operational Health Current State (cache table)
CREATE TABLE IF NOT EXISTS branch_operational_health_current (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  branch_code VARCHAR(50) NOT NULL,
  branch_name VARCHAR(200) NOT NULL,
  region_id UUID,
  region_name VARCHAR(200),
  
  -- Overall health state
  overall_state VARCHAR(20) NOT NULL CHECK (overall_state IN ('HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN')),
  health_score INTEGER NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  
  -- Camera health
  cameras_total INTEGER NOT NULL DEFAULT 0,
  cameras_online INTEGER NOT NULL DEFAULT 0,
  cameras_offline INTEGER NOT NULL DEFAULT 0,
  cameras_recording INTEGER NOT NULL DEFAULT 0,
  cameras_not_recording INTEGER NOT NULL DEFAULT 0,
  camera_state VARCHAR(20) NOT NULL CHECK (camera_state IN ('HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN')),
  
  -- Recorder health
  recorders_total INTEGER NOT NULL DEFAULT 0,
  recorders_online INTEGER NOT NULL DEFAULT 0,
  recorders_offline INTEGER NOT NULL DEFAULT 0,
  recorder_state VARCHAR(20) NOT NULL CHECK (recorder_state IN ('HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN')),
  recorder_type VARCHAR(20),
  recorder_uptime_seconds BIGINT,
  
  -- Storage health
  storage_state VARCHAR(20) NOT NULL CHECK (storage_state IN ('HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN')),
  storage_disks_total INTEGER,
  storage_disks_healthy INTEGER,
  storage_disks_failed INTEGER,
  storage_disks_warning INTEGER,
  storage_capacity_total_gb DECIMAL(12,2),
  storage_capacity_used_gb DECIMAL(12,2),
  storage_capacity_available_gb DECIMAL(12,2),
  storage_capacity_usage_percent DECIMAL(5,2),
  
  -- Retention health
  retention_required_days INTEGER NOT NULL,
  retention_actual_days INTEGER,
  retention_gap_days INTEGER,
  retention_state VARCHAR(20) NOT NULL CHECK (retention_state IN ('COMPLIANT', 'BELOW_POLICY', 'UNKNOWN')),
  retention_confidence DECIMAL(3,2),
  retention_observed_at TIMESTAMPTZ,
  
  -- Network health
  internet_state VARCHAR(20) NOT NULL CHECK (internet_state IN ('ONLINE', 'DEGRADED', 'FAILOVER', 'OFFLINE')),
  primary_link_state VARCHAR(20),
  failover_link_state VARCHAR(20),
  edge_agent_connected BOOLEAN NOT NULL DEFAULT false,
  edge_agent_last_seen_at TIMESTAMPTZ,
  
  -- UPS health
  ups_state VARCHAR(20) NOT NULL CHECK (ups_state IN ('HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN')),
  ups_online BOOLEAN,
  ups_battery_percent INTEGER,
  ups_on_battery BOOLEAN,
  ups_last_seen_at TIMESTAMPTZ,
  
  -- Alert health
  alerts_p1_count INTEGER NOT NULL DEFAULT 0,
  alerts_p2_count INTEGER NOT NULL DEFAULT 0,
  alerts_p3_count INTEGER NOT NULL DEFAULT 0,
  alerts_unacknowledged_count INTEGER NOT NULL DEFAULT 0,
  
  -- Telemetry metadata
  telemetry_freshness VARCHAR(20) NOT NULL CHECK (telemetry_freshness IN ('CURRENT', 'STALE', 'OFFLINE')),
  last_telemetry_at TIMESTAMPTZ,
  
  -- Primary reason (for mosaic display)
  primary_reason TEXT,
  
  -- Full health reasons and details
  health_reasons JSONB NOT NULL DEFAULT '[]',
  component_details JSONB,
  
  -- Timestamps
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one record per branch (upsert pattern)
  CONSTRAINT branch_operational_health_current_unique UNIQUE(tenant_id, branch_id)
);

-- Indexes for fast querying
CREATE INDEX idx_branch_health_current_tenant ON branch_operational_health_current(tenant_id, overall_state);
CREATE INDEX idx_branch_health_current_state ON branch_operational_health_current(overall_state, health_score DESC);
CREATE INDEX idx_branch_health_current_branch ON branch_operational_health_current(branch_id);
CREATE INDEX idx_branch_health_current_region ON branch_operational_health_current(region_id, overall_state) WHERE region_id IS NOT NULL;
CREATE INDEX idx_branch_health_current_reason_codes ON branch_operational_health_current USING GIN(reason_codes);
CREATE INDEX idx_branch_health_current_retention ON branch_operational_health_current(retention_state) WHERE retention_state = 'BELOW_POLICY';
CREATE INDEX idx_branch_health_current_internet ON branch_operational_health_current(internet_state) WHERE internet_state IN ('DEGRADED', 'FAILOVER', 'OFFLINE');
CREATE INDEX idx_branch_health_current_freshness ON branch_operational_health_current(telemetry_freshness, last_telemetry_at DESC);
CREATE INDEX idx_branch_health_current_updated ON branch_operational_health_current(updated_at DESC);

-- Branch Operational Health History (state transitions)
CREATE TABLE IF NOT EXISTS branch_operational_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  branch_code VARCHAR(50) NOT NULL,
  branch_name VARCHAR(200) NOT NULL,
  
  -- State transition
  previous_state VARCHAR(20) CHECK (previous_state IN ('HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN')),
  new_state VARCHAR(20) NOT NULL CHECK (new_state IN ('HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN')),
  previous_score INTEGER CHECK (previous_score >= 0 AND previous_score <= 100),
  new_score INTEGER NOT NULL CHECK (new_score >= 0 AND new_score <= 100),
  
  -- Transition reasons
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  health_reasons JSONB NOT NULL DEFAULT '[]',
  
  -- Component states at transition
  camera_state VARCHAR(20),
  recorder_state VARCHAR(20),
  storage_state VARCHAR(20),
  retention_state VARCHAR(20),
  internet_state VARCHAR(20),
  ups_state VARCHAR(20),
  
  -- Snapshot of key metrics
  cameras_online INTEGER,
  cameras_total INTEGER,
  cameras_recording INTEGER,
  recorders_online INTEGER,
  retention_actual_days INTEGER,
  retention_required_days INTEGER,
  
  -- Timestamps
  transition_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for historical analysis
CREATE INDEX idx_branch_health_history_branch ON branch_operational_health_history(branch_id, transition_at DESC);
CREATE INDEX idx_branch_health_history_tenant ON branch_operational_health_history(tenant_id, transition_at DESC);
CREATE INDEX idx_branch_health_history_state ON branch_operational_health_history(new_state, transition_at DESC);
CREATE INDEX idx_branch_health_history_transitions ON branch_operational_health_history(previous_state, new_state, transition_at DESC);
CREATE INDEX idx_branch_health_history_reason_codes ON branch_operational_health_history USING GIN(reason_codes);

-- Branch Health Change Events (for real-time notifications)
CREATE TABLE IF NOT EXISTS branch_health_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  branch_code VARCHAR(50) NOT NULL,
  branch_name VARCHAR(200) NOT NULL,
  
  -- Event type
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'STATE_CHANGED', 'SCORE_DEGRADED', 'SCORE_IMPROVED',
    'CRITICAL_ENTERED', 'CRITICAL_CLEARED', 'WARNING_ENTERED', 
    'WARNING_CLEARED', 'REASON_ADDED', 'REASON_CLEARED'
  )),
  
  -- State change
  previous_state VARCHAR(20),
  new_state VARCHAR(20) NOT NULL,
  previous_score INTEGER,
  new_score INTEGER NOT NULL,
  score_delta INTEGER,
  
  -- Reason changes
  reason_codes_added TEXT[],
  reason_codes_removed TEXT[],
  current_reason_codes TEXT[],
  
  -- Full event data
  event_data JSONB NOT NULL,
  
  -- Event lifecycle
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  consumed BOOLEAN NOT NULL DEFAULT false,
  consumed_at TIMESTAMPTZ,
  
  -- Timestamps
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for event processing
CREATE INDEX idx_branch_health_events_pending ON branch_health_change_events(created_at) WHERE NOT published;
CREATE INDEX idx_branch_health_events_branch ON branch_health_change_events(branch_id, occurred_at DESC);
CREATE INDEX idx_branch_health_events_type ON branch_health_change_events(event_type, occurred_at DESC);
CREATE INDEX idx_branch_health_events_critical ON branch_health_change_events(occurred_at DESC) 
  WHERE event_type IN ('CRITICAL_ENTERED', 'CRITICAL_CLEARED');

-- Dashboard Summary Cache (for fast HO dashboard load)
CREATE TABLE IF NOT EXISTS operational_dashboard_summary_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Branch summary
  branches_total INTEGER NOT NULL DEFAULT 0,
  branches_healthy INTEGER NOT NULL DEFAULT 0,
  branches_warning INTEGER NOT NULL DEFAULT 0,
  branches_critical INTEGER NOT NULL DEFAULT 0,
  branches_unknown INTEGER NOT NULL DEFAULT 0,
  
  -- Camera summary
  cameras_total INTEGER NOT NULL DEFAULT 0,
  cameras_online INTEGER NOT NULL DEFAULT 0,
  cameras_offline INTEGER NOT NULL DEFAULT 0,
  cameras_recording INTEGER NOT NULL DEFAULT 0,
  cameras_not_recording INTEGER NOT NULL DEFAULT 0,
  
  -- Recorder summary
  recorders_total INTEGER NOT NULL DEFAULT 0,
  recorders_online INTEGER NOT NULL DEFAULT 0,
  recorders_offline INTEGER NOT NULL DEFAULT 0,
  
  -- Storage summary
  storage_healthy INTEGER NOT NULL DEFAULT 0,
  storage_warning INTEGER NOT NULL DEFAULT 0,
  storage_critical INTEGER NOT NULL DEFAULT 0,
  
  -- Retention summary
  retention_compliant_branches INTEGER NOT NULL DEFAULT 0,
  retention_violating_branches INTEGER NOT NULL DEFAULT 0,
  
  -- Network summary
  network_online INTEGER NOT NULL DEFAULT 0,
  network_degraded INTEGER NOT NULL DEFAULT 0,
  network_failover INTEGER NOT NULL DEFAULT 0,
  network_offline INTEGER NOT NULL DEFAULT 0,
  
  -- Alert summary
  alerts_p1 INTEGER NOT NULL DEFAULT 0,
  alerts_p2 INTEGER NOT NULL DEFAULT 0,
  alerts_p3 INTEGER NOT NULL DEFAULT 0,
  
  -- Full summary data
  summary_data JSONB,
  
  -- Cache metadata
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Ensure one record per tenant (latest)
  CONSTRAINT dashboard_summary_cache_unique UNIQUE(tenant_id, generated_at)
);

CREATE INDEX idx_dashboard_summary_tenant ON operational_dashboard_summary_cache(tenant_id, generated_at DESC);
CREATE INDEX idx_dashboard_summary_active ON operational_dashboard_summary_cache(tenant_id) 
  WHERE expires_at > NOW();

-- Comments for documentation
COMMENT ON TABLE branch_operational_health_current IS 'Canonical current operational health state for all branches - single source of truth';
COMMENT ON TABLE branch_operational_health_history IS 'Historical record of branch health state transitions for availability reporting';
COMMENT ON TABLE branch_health_change_events IS 'Real-time health change events for WebSocket notifications and alerts';
COMMENT ON TABLE operational_dashboard_summary_cache IS 'Fast cache for HO dashboard summary KPIs';

COMMENT ON COLUMN branch_operational_health_current.overall_state IS 'HEALTHY, WARNING, CRITICAL, or UNKNOWN - never assume UNKNOWN is HEALTHY';
COMMENT ON COLUMN branch_operational_health_current.health_score IS '0-100 score where 100 is perfect health';
COMMENT ON COLUMN branch_operational_health_current.reason_codes IS 'Array of reason codes explaining health state (e.g., HDD_FAILED, RETENTION_BELOW_POLICY)';
COMMENT ON COLUMN branch_operational_health_current.retention_state IS 'COMPLIANT, BELOW_POLICY, or UNKNOWN - UNKNOWN means insufficient evidence';
COMMENT ON COLUMN branch_operational_health_current.telemetry_freshness IS 'CURRENT (<30s), STALE (30s-5min), or OFFLINE (>5min)';
COMMENT ON COLUMN branch_operational_health_current.primary_reason IS 'Human-readable primary reason for current state (for mosaic display)';
