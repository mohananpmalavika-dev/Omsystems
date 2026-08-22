-- Federation Event Sourcing Infrastructure
-- Implements outbox/inbox pattern for reliable cross-server synchronization

-- =====================================================
-- Event Log (Immutable Append-Only Log)
-- =====================================================
CREATE TABLE IF NOT EXISTS federation_event_log (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  origin_server TEXT NOT NULL,
  sequence_number BIGINT NOT NULL,
  tenant_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  checksum TEXT NOT NULL,
  event_data JSONB NOT NULL,
  correlation_id TEXT,
  causation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for event log
CREATE INDEX idx_fed_event_log_origin_seq ON federation_event_log(origin_server, sequence_number DESC);
CREATE INDEX idx_fed_event_log_tenant ON federation_event_log(tenant_id, timestamp DESC);
CREATE INDEX idx_fed_event_log_aggregate ON federation_event_log(aggregate_type, aggregate_id, sequence_number DESC);
CREATE INDEX idx_fed_event_log_type ON federation_event_log(event_type, timestamp DESC);
CREATE INDEX idx_fed_event_log_timestamp ON federation_event_log(timestamp DESC);
CREATE INDEX idx_fed_event_log_correlation ON federation_event_log(correlation_id) WHERE correlation_id IS NOT NULL;

-- Unique constraint: one sequence number per origin server
CREATE UNIQUE INDEX idx_fed_event_log_origin_seq_unique ON federation_event_log(origin_server, sequence_number);

COMMENT ON TABLE federation_event_log IS 'Immutable append-only log of all federation events';
COMMENT ON COLUMN federation_event_log.event_id IS 'Globally unique event identifier';
COMMENT ON COLUMN federation_event_log.origin_server IS 'Server ID that originated this event';
COMMENT ON COLUMN federation_event_log.sequence_number IS 'Monotonically increasing sequence per origin server';
COMMENT ON COLUMN federation_event_log.checksum IS 'SHA-256 checksum for event integrity verification';

-- =====================================================
-- Outbox Pattern (Reliable Event Publishing)
-- =====================================================
CREATE TABLE IF NOT EXISTS federation_event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL REFERENCES federation_event_log(event_id),
  event_data JSONB NOT NULL,
  target_servers TEXT[] NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Indexes for outbox
CREATE INDEX idx_fed_outbox_status ON federation_event_outbox(status, created_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_fed_outbox_retry ON federation_event_outbox(next_retry_at) WHERE status = 'failed' AND next_retry_at IS NOT NULL;
CREATE INDEX idx_fed_outbox_event ON federation_event_outbox(event_id);

COMMENT ON TABLE federation_event_outbox IS 'Outbox pattern for reliable event publishing to remote servers';
COMMENT ON COLUMN federation_event_outbox.target_servers IS 'Array of server IDs to publish this event to';

-- =====================================================
-- Inbox Pattern (Reliable Event Reception)
-- =====================================================
CREATE TABLE IF NOT EXISTS federation_event_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  source_server TEXT NOT NULL,
  event_data JSONB NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('received', 'processing', 'applied', 'duplicate', 'failed')),
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Indexes for inbox
CREATE INDEX idx_fed_inbox_status ON federation_event_inbox(status, received_at) WHERE status IN ('received', 'failed');
CREATE INDEX idx_fed_inbox_source ON federation_event_inbox(source_server, received_at DESC);
CREATE INDEX idx_fed_inbox_event ON federation_event_inbox(event_id);

COMMENT ON TABLE federation_event_inbox IS 'Inbox pattern for reliable event reception from remote servers';
COMMENT ON COLUMN federation_event_inbox.idempotency_key IS 'Prevents duplicate processing: origin_server:event_id:sequence';

-- =====================================================
-- Event Subscriptions (Local Event Handlers)
-- =====================================================
CREATE TABLE IF NOT EXISTS federation_event_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id TEXT NOT NULL,
  subscriber_type TEXT NOT NULL, -- 'service', 'webhook', 'queue'
  event_types TEXT[] NOT NULL,
  filter_expression JSONB,
  endpoint_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fed_subscriptions_types ON federation_event_subscriptions USING GIN(event_types);
CREATE INDEX idx_fed_subscriptions_active ON federation_event_subscriptions(is_active) WHERE is_active = true;

COMMENT ON TABLE federation_event_subscriptions IS 'Local subscriptions to federation events';

-- =====================================================
-- Event Processing Metrics
-- =====================================================
CREATE TABLE IF NOT EXISTS federation_event_metrics (
  id BIGSERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  metric_type TEXT NOT NULL, -- 'outbox_processed', 'inbox_processed', 'publish_latency', 'apply_latency'
  event_type TEXT,
  count INT NOT NULL DEFAULT 1,
  duration_ms INT,
  success BOOLEAN NOT NULL DEFAULT true,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fed_metrics_server_time ON federation_event_metrics(server_id, recorded_at DESC);
CREATE INDEX idx_fed_metrics_type ON federation_event_metrics(metric_type, recorded_at DESC);

-- Partitioning for metrics (monthly partitions)
-- In production, automate partition creation

COMMENT ON TABLE federation_event_metrics IS 'Performance and reliability metrics for federation event processing';

-- =====================================================
-- Event Replay Log (For Debugging and Recovery)
-- =====================================================
CREATE TABLE IF NOT EXISTS federation_event_replay_log (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  replay_reason TEXT NOT NULL,
  replayed_by TEXT NOT NULL,
  original_timestamp TIMESTAMPTZ NOT NULL,
  replay_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  replay_result TEXT NOT NULL, -- 'success', 'skipped', 'failed'
  notes TEXT
);

CREATE INDEX idx_fed_replay_event ON federation_event_replay_log(event_id);
CREATE INDEX idx_fed_replay_timestamp ON federation_event_replay_log(replay_timestamp DESC);

COMMENT ON TABLE federation_event_replay_log IS 'Audit log of event replays for debugging and recovery';

-- =====================================================
-- Server Synchronization State
-- =====================================================
CREATE TABLE IF NOT EXISTS federation_sync_state (
  local_server_id TEXT NOT NULL,
  remote_server_id TEXT NOT NULL,
  last_received_sequence BIGINT NOT NULL DEFAULT 0,
  last_sent_sequence BIGINT NOT NULL DEFAULT 0,
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_lag_seconds INT,
  is_healthy BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (local_server_id, remote_server_id)
);

CREATE INDEX idx_fed_sync_state_health ON federation_sync_state(is_healthy, sync_lag_seconds);

COMMENT ON TABLE federation_sync_state IS 'Tracks synchronization state between server pairs';
COMMENT ON COLUMN federation_sync_state.sync_lag_seconds IS 'How far behind this server is from remote';

-- =====================================================
-- Functions for Event Processing
-- =====================================================

-- Function: Get next events for sync
CREATE OR REPLACE FUNCTION get_federation_events_since(
  p_origin_server TEXT,
  p_from_sequence BIGINT,
  p_limit INT DEFAULT 1000
)
RETURNS TABLE (
  event_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT fel.event_data
  FROM federation_event_log fel
  WHERE fel.origin_server = p_origin_server
    AND fel.sequence_number > p_from_sequence
  ORDER BY fel.sequence_number
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_federation_events_since IS 'Retrieve events from a specific sequence for synchronization';

-- Function: Record sync progress
CREATE OR REPLACE FUNCTION update_federation_sync_state(
  p_local_server TEXT,
  p_remote_server TEXT,
  p_last_received_seq BIGINT DEFAULT NULL,
  p_last_sent_seq BIGINT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO federation_sync_state (
    local_server_id,
    remote_server_id,
    last_received_sequence,
    last_sent_sequence,
    last_sync_at
  ) VALUES (
    p_local_server,
    p_remote_server,
    COALESCE(p_last_received_seq, 0),
    COALESCE(p_last_sent_seq, 0),
    now()
  )
  ON CONFLICT (local_server_id, remote_server_id)
  DO UPDATE SET
    last_received_sequence = CASE 
      WHEN p_last_received_seq IS NOT NULL 
      THEN p_last_received_seq 
      ELSE federation_sync_state.last_received_sequence 
    END,
    last_sent_sequence = CASE 
      WHEN p_last_sent_seq IS NOT NULL 
      THEN p_last_sent_seq 
      ELSE federation_sync_state.last_sent_sequence 
    END,
    last_sync_at = now(),
    sync_lag_seconds = EXTRACT(EPOCH FROM (now() - federation_sync_state.last_sync_at))::INT,
    is_healthy = EXTRACT(EPOCH FROM (now() - federation_sync_state.last_sync_at)) < 300; -- 5 minutes
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_federation_sync_state IS 'Update synchronization state after successful sync';

-- Function: Get sync health dashboard
CREATE OR REPLACE FUNCTION get_federation_sync_health()
RETURNS TABLE (
  local_server TEXT,
  remote_server TEXT,
  last_received_seq BIGINT,
  last_sent_seq BIGINT,
  lag_seconds INT,
  is_healthy BOOLEAN,
  last_sync TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fss.local_server_id,
    fss.remote_server_id,
    fss.last_received_sequence,
    fss.last_sent_sequence,
    fss.sync_lag_seconds,
    fss.is_healthy,
    fss.last_sync_at
  FROM federation_sync_state fss
  ORDER BY fss.is_healthy DESC, fss.sync_lag_seconds DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- Maintenance Functions
-- =====================================================

-- Function: Clean old outbox entries
CREATE OR REPLACE FUNCTION cleanup_federation_outbox(p_days_old INT DEFAULT 7)
RETURNS INT AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM federation_event_outbox
  WHERE status = 'completed'
    AND processed_at < now() - (p_days_old || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Clean old inbox entries
CREATE OR REPLACE FUNCTION cleanup_federation_inbox(p_days_old INT DEFAULT 7)
RETURNS INT AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM federation_event_inbox
  WHERE status IN ('applied', 'duplicate')
    AND processed_at < now() - (p_days_old || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Archive old events
CREATE OR REPLACE FUNCTION archive_federation_events(p_days_old INT DEFAULT 90)
RETURNS INT AS $$
DECLARE
  v_archived_count INT;
BEGIN
  -- In production, move to separate archive table or cold storage
  -- For now, just return count that would be archived
  SELECT COUNT(*)::INT INTO v_archived_count
  FROM federation_event_log
  WHERE created_at < now() - (p_days_old || ' days')::INTERVAL;
  
  RETURN v_archived_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Views for Monitoring
-- =====================================================

-- View: Outbox processing statistics
CREATE OR REPLACE VIEW federation_outbox_stats AS
SELECT 
  status,
  COUNT(*) as count,
  AVG(retry_count) as avg_retries,
  MAX(created_at) as latest_created
FROM federation_event_outbox
GROUP BY status;

-- View: Inbox processing statistics
CREATE OR REPLACE VIEW federation_inbox_stats AS
SELECT 
  source_server,
  status,
  COUNT(*) as count,
  MAX(received_at) as latest_received
FROM federation_event_inbox
GROUP BY source_server, status;

-- View: Event type distribution
CREATE OR REPLACE VIEW federation_event_type_stats AS
SELECT 
  event_type,
  aggregate_type,
  COUNT(*) as count,
  MIN(timestamp) as first_seen,
  MAX(timestamp) as last_seen,
  COUNT(DISTINCT tenant_id) as tenant_count
FROM federation_event_log
WHERE timestamp > now() - INTERVAL '24 hours'
GROUP BY event_type, aggregate_type
ORDER BY count DESC;

-- View: Sync lag monitoring
CREATE OR REPLACE VIEW federation_sync_lag_monitor AS
SELECT 
  fss.local_server_id,
  fss.remote_server_id,
  fs.name as remote_server_name,
  fss.last_received_sequence,
  fss.sync_lag_seconds,
  fss.is_healthy,
  fss.last_sync_at,
  CASE 
    WHEN fss.sync_lag_seconds < 30 THEN 'healthy'
    WHEN fss.sync_lag_seconds < 300 THEN 'warning'
    ELSE 'critical'
  END as health_status
FROM federation_sync_state fss
LEFT JOIN federated_servers fs ON fs.id::text = fss.remote_server_id;

-- =====================================================
-- Scheduled Cleanup Jobs (Optional - configure externally)
-- =====================================================

COMMENT ON FUNCTION cleanup_federation_outbox IS 'Schedule this daily: SELECT cleanup_federation_outbox(7);';
COMMENT ON FUNCTION cleanup_federation_inbox IS 'Schedule this daily: SELECT cleanup_federation_inbox(7);';
COMMENT ON FUNCTION archive_federation_events IS 'Schedule this monthly: SELECT archive_federation_events(90);';

-- =====================================================
-- Grants (Adjust based on your security model)
-- =====================================================

-- Grant appropriate permissions to application user
-- GRANT SELECT, INSERT ON federation_event_log TO app_user;
-- GRANT ALL ON federation_event_outbox TO app_user;
-- GRANT ALL ON federation_event_inbox TO app_user;
-- GRANT SELECT ON federation_event_metrics TO app_user;

-- =====================================================
-- Initial Sync State Setup
-- =====================================================

-- This will be populated automatically as servers register and sync
-- No initial data needed
