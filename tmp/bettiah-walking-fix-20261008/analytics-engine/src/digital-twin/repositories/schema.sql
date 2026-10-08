/**
 * Digital Twin Database Schema
 * 
 * PostgreSQL schema for Digital Twin infrastructure modeling.
 */

-- Assets table
CREATE TABLE IF NOT EXISTS twin_assets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES twin_assets(id) ON DELETE CASCADE,
  
  -- Current state
  status TEXT NOT NULL DEFAULT 'unknown',
  
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',
  
  -- Health
  health_score INTEGER NOT NULL DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100),
  health_last_seen TIMESTAMPTZ,
  health_issues JSONB NOT NULL DEFAULT '[]',
  health_metrics JSONB,
  
  -- Security
  security_score INTEGER NOT NULL DEFAULT 100 CHECK (security_score >= 0 AND security_score <= 100),
  security_vulnerabilities INTEGER NOT NULL DEFAULT 0,
  security_config_issues INTEGER NOT NULL DEFAULT 0,
  security_last_audit TIMESTAMPTZ,
  security_details JSONB,
  
  -- Business context
  location TEXT,
  purpose TEXT,
  criticality TEXT CHECK (criticality IN ('critical', 'high', 'medium', 'low')),
  compliance_required BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for assets
CREATE INDEX IF NOT EXISTS idx_twin_assets_type ON twin_assets(type);
CREATE INDEX IF NOT EXISTS idx_twin_assets_parent_id ON twin_assets(parent_id);
CREATE INDEX IF NOT EXISTS idx_twin_assets_status ON twin_assets(status);
CREATE INDEX IF NOT EXISTS idx_twin_assets_health_score ON twin_assets(health_score);
CREATE INDEX IF NOT EXISTS idx_twin_assets_security_score ON twin_assets(security_score);
CREATE INDEX IF NOT EXISTS idx_twin_assets_criticality ON twin_assets(criticality);
CREATE INDEX IF NOT EXISTS idx_twin_assets_name ON twin_assets USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_twin_assets_metadata ON twin_assets USING gin(metadata);

-- Relationships table
CREATE TABLE IF NOT EXISTS twin_relationships (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES twin_assets(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES twin_assets(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  criticality TEXT NOT NULL CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Indexes for relationships
CREATE INDEX IF NOT EXISTS idx_twin_relationships_source ON twin_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_twin_relationships_target ON twin_relationships(target_id);
CREATE INDEX IF NOT EXISTS idx_twin_relationships_type ON twin_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_twin_relationships_criticality ON twin_relationships(criticality);
CREATE INDEX IF NOT EXISTS idx_twin_relationships_source_target ON twin_relationships(source_id, target_id);

-- Prevent duplicate relationships
CREATE UNIQUE INDEX IF NOT EXISTS idx_twin_relationships_unique
  ON twin_relationships(source_id, target_id, relationship_type);

-- State history table
CREATE TABLE IF NOT EXISTS twin_state_history (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES twin_assets(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  health_score INTEGER NOT NULL,
  security_score INTEGER NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Indexes for state history
CREATE INDEX IF NOT EXISTS idx_twin_state_history_asset_id ON twin_state_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_twin_state_history_timestamp ON twin_state_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_twin_state_history_asset_timestamp ON twin_state_history(asset_id, timestamp DESC);

-- Partition state history by month for performance (optional, for large deployments)
-- CREATE TABLE twin_state_history_y2024m01 PARTITION OF twin_state_history
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Events table
CREATE TABLE IF NOT EXISTS twin_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES twin_assets(id) ON DELETE CASCADE,
  asset_name TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  previous_state JSONB NOT NULL DEFAULT '{}',
  new_state JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_twin_events_asset_id ON twin_events(asset_id);
CREATE INDEX IF NOT EXISTS idx_twin_events_type ON twin_events(event_type);
CREATE INDEX IF NOT EXISTS idx_twin_events_timestamp ON twin_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_twin_events_asset_timestamp ON twin_events(asset_id, timestamp DESC);

-- Issues table
CREATE TABLE IF NOT EXISTS twin_issues (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES twin_assets(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Indexes for issues
CREATE INDEX IF NOT EXISTS idx_twin_issues_asset_id ON twin_issues(asset_id);
CREATE INDEX IF NOT EXISTS idx_twin_issues_severity ON twin_issues(severity);
CREATE INDEX IF NOT EXISTS idx_twin_issues_resolved ON twin_issues(resolved_at) WHERE resolved_at IS NULL;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_twin_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for assets
DROP TRIGGER IF EXISTS trigger_update_twin_assets_updated_at ON twin_assets;
CREATE TRIGGER trigger_update_twin_assets_updated_at
  BEFORE UPDATE ON twin_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_twin_updated_at();

-- Trigger for relationships
DROP TRIGGER IF EXISTS trigger_update_twin_relationships_updated_at ON twin_relationships;
CREATE TRIGGER trigger_update_twin_relationships_updated_at
  BEFORE UPDATE ON twin_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_twin_updated_at();

-- Function to create event on asset status change
CREATE OR REPLACE FUNCTION log_twin_asset_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    INSERT INTO twin_events (
      id,
      event_type,
      asset_id,
      asset_name,
      timestamp,
      previous_state,
      new_state
    ) VALUES (
      'evt_' || gen_random_uuid()::TEXT,
      'asset_status_changed',
      NEW.id,
      NEW.name,
      NOW(),
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log status changes
DROP TRIGGER IF EXISTS trigger_log_twin_asset_status_change ON twin_assets;
CREATE TRIGGER trigger_log_twin_asset_status_change
  AFTER UPDATE ON twin_assets
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_twin_asset_status_change();

-- Function to create snapshot on health/security change
CREATE OR REPLACE FUNCTION create_twin_snapshot_on_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.health_score != OLD.health_score OR NEW.security_score != OLD.security_score THEN
    INSERT INTO twin_state_history (
      id,
      asset_id,
      timestamp,
      status,
      health_score,
      security_score,
      metrics
    ) VALUES (
      'snap_' || gen_random_uuid()::TEXT,
      NEW.id,
      NOW(),
      NEW.status,
      NEW.health_score,
      NEW.security_score,
      '{}'::JSONB
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create snapshots
DROP TRIGGER IF EXISTS trigger_create_twin_snapshot ON twin_assets;
CREATE TRIGGER trigger_create_twin_snapshot
  AFTER UPDATE ON twin_assets
  FOR EACH ROW
  WHEN (
    OLD.health_score IS DISTINCT FROM NEW.health_score OR
    OLD.security_score IS DISTINCT FROM NEW.security_score
  )
  EXECUTE FUNCTION create_twin_snapshot_on_change();

-- Views for common queries

-- View: Asset with relationship counts
CREATE OR REPLACE VIEW twin_assets_with_counts AS
SELECT
  a.*,
  COUNT(DISTINCT r_out.id) as outgoing_relationships,
  COUNT(DISTINCT r_in.id) as incoming_relationships
FROM twin_assets a
LEFT JOIN twin_relationships r_out ON a.id = r_out.source_id
LEFT JOIN twin_relationships r_in ON a.id = r_in.target_id
GROUP BY a.id;

-- View: Critical infrastructure (critical assets or with critical dependents)
CREATE OR REPLACE VIEW twin_critical_infrastructure AS
SELECT DISTINCT a.*
FROM twin_assets a
WHERE a.criticality = 'critical'
   OR a.id IN (
     SELECT DISTINCT target_id
     FROM twin_relationships
     WHERE criticality = 'critical'
   );

-- View: Unhealthy assets
CREATE OR REPLACE VIEW twin_unhealthy_assets AS
SELECT *
FROM twin_assets
WHERE health_score < 70 OR status IN ('critical', 'offline', 'degraded')
ORDER BY health_score ASC, status;

-- View: Insecure assets
CREATE OR REPLACE VIEW twin_insecure_assets AS
SELECT *
FROM twin_assets
WHERE security_score < 70 OR security_vulnerabilities > 0
ORDER BY security_score ASC, security_vulnerabilities DESC;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO analytics_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO analytics_user;

-- Comments for documentation
COMMENT ON TABLE twin_assets IS 'Digital twin assets representing infrastructure components';
COMMENT ON TABLE twin_relationships IS 'Relationships and dependencies between digital twin assets';
COMMENT ON TABLE twin_state_history IS 'Historical state snapshots for time-series analysis';
COMMENT ON TABLE twin_events IS 'Events and changes in the digital twin';
COMMENT ON TABLE twin_issues IS 'Issues and problems detected on assets';

COMMENT ON COLUMN twin_assets.type IS 'Asset type: enterprise, region, branch, camera, nvr, dvr, storage, switch, gateway, network, vlan, server, recorder';
COMMENT ON COLUMN twin_assets.status IS 'Current status: healthy, warning, critical, offline, unknown, degraded, maintenance';
COMMENT ON COLUMN twin_assets.metadata IS 'Type-specific metadata (IP address, model, firmware, etc.)';
COMMENT ON COLUMN twin_assets.health_score IS 'Health score from 0 (critical) to 100 (healthy)';
COMMENT ON COLUMN twin_assets.security_score IS 'Security score from 0 (insecure) to 100 (secure)';

COMMENT ON COLUMN twin_relationships.relationship_type IS 'Relationship type: contains, connected_to, depends_on, records_to, stores_on, powered_by, uplink_to, routes_through, managed_by, authenticates_via, monitors, backs_up, replicates_to';
COMMENT ON COLUMN twin_relationships.criticality IS 'Impact if this relationship fails: low, medium, high, critical';
