-- Create incidents table with tenant isolation and comprehensive tracking
-- Migration: 20260811_create_incidents_table

BEGIN;

-- Create incident status enum
DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM (
    'OPEN',
    'ACKNOWLEDGED',
    'INVESTIGATING',
    'RESOLVED',
    'CLOSED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create incident severity enum
DO $$ BEGIN
  CREATE TYPE incident_severity AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create incident type enum
DO $$ BEGIN
  CREATE TYPE incident_type AS ENUM (
    'regional_outage',
    'infrastructure_failure',
    'cascade_failure',
    'mass_event',
    'fire_emergency',
    'security_breach',
    'storage_crisis',
    'intrusion',
    'camera_offline',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create incidents table
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Core information
  title TEXT NOT NULL,
  description TEXT,
  
  -- Classification
  incident_type incident_type NOT NULL,
  severity incident_severity NOT NULL,
  status incident_status NOT NULL DEFAULT 'OPEN',
  
  -- Location and asset associations
  branch_id UUID,
  camera_id UUID,
  device_id UUID,
  
  -- Assignment
  assigned_to UUID,
  
  -- Alert correlation
  alert_count INTEGER NOT NULL DEFAULT 0,
  
  -- Timeline
  first_detected_at TIMESTAMPTZ,
  last_detected_at TIMESTAMPTZ,
  
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Extensibility
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Constraints
  CONSTRAINT incidents_tenant_fk 
    FOREIGN KEY (tenant_id) 
    REFERENCES tenants(id) 
    ON DELETE CASCADE,
  
  CONSTRAINT incidents_branch_fk 
    FOREIGN KEY (branch_id, tenant_id) 
    REFERENCES branches(id, tenant_id) 
    ON DELETE SET NULL,
  
  CONSTRAINT incidents_camera_fk 
    FOREIGN KEY (camera_id, tenant_id) 
    REFERENCES cameras(id, tenant_id) 
    ON DELETE SET NULL,
  
  CONSTRAINT incidents_assigned_to_fk 
    FOREIGN KEY (assigned_to) 
    REFERENCES users(id) 
    ON DELETE SET NULL,
  
  CONSTRAINT incidents_acknowledged_by_fk 
    FOREIGN KEY (acknowledged_by) 
    REFERENCES users(id) 
    ON DELETE SET NULL,
  
  CONSTRAINT incidents_resolved_by_fk 
    FOREIGN KEY (resolved_by) 
    REFERENCES users(id) 
    ON DELETE SET NULL,
  
  CONSTRAINT incidents_alert_count_positive 
    CHECK (alert_count >= 0),
  
  CONSTRAINT incidents_timeline_consistency 
    CHECK (
      (acknowledged_at IS NULL OR acknowledged_at >= created_at) AND
      (resolved_at IS NULL OR resolved_at >= created_at) AND
      (resolved_at IS NULL OR acknowledged_at IS NULL OR resolved_at >= acknowledged_at)
    )
);

-- Create incident_alerts junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS incident_alerts (
  incident_id UUID NOT NULL,
  alert_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  alert_severity TEXT NOT NULL,
  camera_id UUID,
  detected_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (incident_id, alert_id),
  
  CONSTRAINT incident_alerts_incident_fk 
    FOREIGN KEY (incident_id) 
    REFERENCES incidents(id) 
    ON DELETE CASCADE
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- Primary listing query: tenant + created_at + id for cursor pagination
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_created 
ON incidents (tenant_id, created_at DESC, id DESC);

-- Status filtering (most common filter)
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_status_created 
ON incidents (tenant_id, status, created_at DESC);

-- Severity filtering
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_severity_created 
ON incidents (tenant_id, severity, created_at DESC);

-- Branch filtering
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_branch_created 
ON incidents (tenant_id, branch_id, created_at DESC) 
WHERE branch_id IS NOT NULL;

-- Camera filtering
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_camera_created 
ON incidents (tenant_id, camera_id, created_at DESC) 
WHERE camera_id IS NOT NULL;

-- Assignment filtering
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_assigned_created 
ON incidents (tenant_id, assigned_to, created_at DESC) 
WHERE assigned_to IS NOT NULL;

-- Unassigned incidents
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_unassigned_created 
ON incidents (tenant_id, created_at DESC) 
WHERE assigned_to IS NULL;

-- Updated timestamp for sorting
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_updated 
ON incidents (tenant_id, updated_at DESC, id DESC);

-- Type filtering
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_type_created 
ON incidents (tenant_id, incident_type, created_at DESC);

-- Full-text search on title and description
CREATE INDEX IF NOT EXISTS idx_incidents_search 
ON incidents USING gin(
  to_tsvector('english', 
    COALESCE(title, '') || ' ' || 
    COALESCE(description, '')
  )
);

-- Incident alerts lookup
CREATE INDEX IF NOT EXISTS idx_incident_alerts_incident 
ON incident_alerts (incident_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_incident_alerts_alert 
ON incident_alerts (alert_id);

-- Metadata JSONB queries (if needed)
CREATE INDEX IF NOT EXISTS idx_incidents_metadata 
ON incidents USING gin(metadata);

-- ========================================
-- TRIGGERS
-- ========================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_incidents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_incidents_updated_at ON incidents;
CREATE TRIGGER trigger_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_incidents_updated_at();

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON TABLE incidents IS 
'Core incident tracking table with tenant isolation. Incidents are parent containers for correlated alerts.';

COMMENT ON COLUMN incidents.tenant_id IS 
'Tenant isolation - MUST be enforced in all queries';

COMMENT ON COLUMN incidents.alert_count IS 
'Denormalized count of child alerts for quick statistics';

COMMENT ON COLUMN incidents.metadata IS 
'Extensible JSON field for correlation patterns, evidence, and custom data';

COMMENT ON TABLE incident_alerts IS 
'Many-to-many relationship between incidents and alerts';

COMMIT;
