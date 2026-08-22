-- Recorder Evidence Persistence Schema
--
-- Stores evidence snapshots for:
-- - Compliance verification
-- - Historical trending
-- - Root cause analysis
-- - Reporting

-- Evidence states enum
CREATE TYPE evidence_state AS ENUM (
  'OBSERVED',
  'UNKNOWN',
  'UNSUPPORTED',
  'AUTH_FAILED',
  'TIMEOUT',
  'UNREACHABLE',
  'MALFORMED_RESPONSE',
  'RATE_LIMITED',
  'DEVICE_ERROR'
);

-- Main evidence snapshots table
CREATE TABLE IF NOT EXISTS recorder_evidence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification
  tenant_id UUID NOT NULL,
  branch_id UUID,
  recorder_id UUID NOT NULL,
  
  -- Collection metadata
  adapter_type VARCHAR(50) NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  collection_duration_ms INTEGER NOT NULL,
  
  -- Reachability evidence
  reachable_state evidence_state NOT NULL,
  reachable_value BOOLEAN,
  
  -- Authentication evidence
  authenticated_state evidence_state NOT NULL,
  authenticated_value BOOLEAN,
  
  -- Device information
  device_manufacturer VARCHAR(255),
  device_model VARCHAR(255),
  device_firmware VARCHAR(255),
  device_serial VARCHAR(255),
  
  -- Storage evidence
  storage_state evidence_state NOT NULL,
  storage_total_bytes BIGINT,
  storage_used_bytes BIGINT,
  storage_usage_percent NUMERIC(5,2),
  
  -- Device time evidence
  device_time_state evidence_state NOT NULL,
  device_time_offset_ms INTEGER,
  
  -- Raw metadata (JSONB for flexible querying)
  raw_metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_recorder FOREIGN KEY (recorder_id) REFERENCES recorders(id) ON DELETE CASCADE
);

-- Indexes for evidence snapshots
CREATE INDEX idx_evidence_recorder_collected ON recorder_evidence_snapshots(recorder_id, collected_at DESC);
CREATE INDEX idx_evidence_tenant_collected ON recorder_evidence_snapshots(tenant_id, collected_at DESC);
CREATE INDEX idx_evidence_branch_collected ON recorder_evidence_snapshots(branch_id, collected_at DESC) WHERE branch_id IS NOT NULL;
CREATE INDEX idx_evidence_reachable ON recorder_evidence_snapshots(reachable_state, reachable_value) WHERE reachable_state = 'OBSERVED';
CREATE INDEX idx_evidence_storage ON recorder_evidence_snapshots(storage_usage_percent) WHERE storage_state = 'OBSERVED';

-- Channel evidence table
CREATE TABLE IF NOT EXISTS recorder_channel_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to snapshot
  snapshot_id UUID NOT NULL,
  
  -- Channel identification
  channel_id VARCHAR(100) NOT NULL,
  vendor_channel_ref VARCHAR(100),
  channel_name VARCHAR(255),
  
  -- Enabled state
  enabled_state evidence_state NOT NULL,
  enabled_value BOOLEAN,
  
  -- Stream reachability
  stream_state evidence_state NOT NULL,
  stream_reachable BOOLEAN,
  
  -- Video presence
  video_state evidence_state NOT NULL,
  video_present BOOLEAN,
  
  -- Recording configuration
  recording_configured_state evidence_state NOT NULL,
  recording_configured BOOLEAN,
  
  -- Recording active
  recording_active_state evidence_state NOT NULL,
  recording_active BOOLEAN,
  
  -- Latest recording
  latest_recording_state evidence_state NOT NULL,
  latest_recording_at TIMESTAMPTZ,
  
  -- Archive playability
  archive_state evidence_state NOT NULL,
  archive_playable BOOLEAN,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_snapshot FOREIGN KEY (snapshot_id) REFERENCES recorder_evidence_snapshots(id) ON DELETE CASCADE
);

-- Indexes for channel evidence
CREATE INDEX idx_channel_evidence_snapshot ON recorder_channel_evidence(snapshot_id);
CREATE INDEX idx_channel_evidence_channel ON recorder_channel_evidence(snapshot_id, channel_id);
CREATE INDEX idx_channel_recording_active ON recorder_channel_evidence(recording_active) WHERE recording_active_state = 'OBSERVED';
CREATE INDEX idx_channel_latest_recording ON recorder_channel_evidence(latest_recording_at DESC) WHERE latest_recording_state = 'OBSERVED';

-- View: Latest evidence per recorder
CREATE OR REPLACE VIEW recorder_latest_evidence AS
SELECT DISTINCT ON (recorder_id)
  *
FROM recorder_evidence_snapshots
ORDER BY recorder_id, collected_at DESC;

-- View: Latest channel evidence
CREATE OR REPLACE VIEW recorder_latest_channel_evidence AS
SELECT DISTINCT ON (es.recorder_id, ce.channel_id)
  es.recorder_id,
  es.tenant_id,
  es.branch_id,
  es.collected_at,
  ce.*
FROM recorder_channel_evidence ce
JOIN recorder_evidence_snapshots es ON ce.snapshot_id = es.id
ORDER BY es.recorder_id, ce.channel_id, es.collected_at DESC;

-- View: Recording compliance summary
CREATE OR REPLACE VIEW recorder_recording_compliance AS
SELECT
  es.recorder_id,
  es.tenant_id,
  es.branch_id,
  es.collected_at,
  COUNT(ce.id) as total_channels,
  COUNT(CASE WHEN ce.enabled_value = true THEN 1 END) as enabled_channels,
  COUNT(CASE 
    WHEN ce.recording_active_state = 'OBSERVED' 
    AND ce.recording_active = true 
    THEN 1 
  END) as recording_channels,
  COUNT(CASE 
    WHEN ce.latest_recording_state = 'OBSERVED'
    AND ce.latest_recording_at > NOW() - INTERVAL '5 minutes'
    THEN 1 
  END) as recent_recording_channels,
  ROUND(
    100.0 * COUNT(CASE 
      WHEN ce.recording_active_state = 'OBSERVED' 
      AND ce.recording_active = true 
      THEN 1 
    END) / NULLIF(COUNT(CASE WHEN ce.enabled_value = true THEN 1 END), 0),
    2
  ) as compliance_percent
FROM recorder_evidence_snapshots es
LEFT JOIN recorder_channel_evidence ce ON ce.snapshot_id = es.id
WHERE es.id IN (
  SELECT DISTINCT ON (recorder_id) id
  FROM recorder_evidence_snapshots
  ORDER BY recorder_id, collected_at DESC
)
GROUP BY es.recorder_id, es.tenant_id, es.branch_id, es.collected_at;

-- View: Storage health summary
CREATE OR REPLACE VIEW recorder_storage_health AS
SELECT
  recorder_id,
  tenant_id,
  branch_id,
  collected_at,
  storage_state,
  storage_total_bytes,
  storage_used_bytes,
  storage_usage_percent,
  CASE
    WHEN storage_state != 'OBSERVED' THEN 'UNKNOWN'
    WHEN storage_usage_percent >= 95 THEN 'CRITICAL'
    WHEN storage_usage_percent >= 80 THEN 'WARNING'
    ELSE 'NORMAL'
  END as storage_status
FROM recorder_latest_evidence;

-- Function: Get evidence freshness
CREATE OR REPLACE FUNCTION get_evidence_freshness(
  collected_at TIMESTAMPTZ,
  fresh_threshold_minutes INTEGER DEFAULT 5,
  stale_threshold_minutes INTEGER DEFAULT 30
)
RETURNS TEXT AS $$
BEGIN
  IF collected_at > NOW() - (fresh_threshold_minutes || ' minutes')::INTERVAL THEN
    RETURN 'FRESH';
  ELSIF collected_at > NOW() - (stale_threshold_minutes || ' minutes')::INTERVAL THEN
    RETURN 'STALE';
  ELSE
    RETURN 'EXPIRED';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Clean old evidence
CREATE OR REPLACE FUNCTION clean_old_evidence(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM recorder_evidence_snapshots
  WHERE collected_at < NOW() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE recorder_evidence_snapshots IS 'Stores complete evidence snapshots from recorder adapters';
COMMENT ON TABLE recorder_channel_evidence IS 'Stores per-channel evidence details';
COMMENT ON VIEW recorder_latest_evidence IS 'Most recent evidence snapshot per recorder';
COMMENT ON VIEW recorder_recording_compliance IS 'Recording compliance summary per recorder';
COMMENT ON VIEW recorder_storage_health IS 'Storage health status per recorder';
COMMENT ON FUNCTION get_evidence_freshness IS 'Determines if evidence is FRESH, STALE, or EXPIRED';
COMMENT ON FUNCTION clean_old_evidence IS 'Removes evidence snapshots older than retention period';
