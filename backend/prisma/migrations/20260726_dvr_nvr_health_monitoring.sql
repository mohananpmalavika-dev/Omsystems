-- DVR/NVR Health Monitoring Migration
-- Continuous health tracking for DVR/NVR devices

CREATE TABLE IF NOT EXISTS dvr_nvr_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(120) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL CHECK (status IN ('online', 'offline', 'degraded')),
  latency_ms INTEGER,
  cpu_usage DECIMAL(5, 2),
  memory_usage DECIMAL(5, 2),
  hdd_status JSONB,
  recording_status VARCHAR(20),
  connected_cameras INTEGER,
  total_cameras INTEGER,
  firmware_version VARCHAR(200),
  uptime INTEGER, -- seconds
  temperature DECIMAL(5, 2),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_dvr_nvr_health_device_id ON dvr_nvr_health(device_id);
CREATE INDEX IF NOT EXISTS idx_dvr_nvr_health_timestamp ON dvr_nvr_health(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_dvr_nvr_health_status ON dvr_nvr_health(status);
CREATE INDEX IF NOT EXISTS idx_dvr_nvr_health_device_timestamp ON dvr_nvr_health(device_id, timestamp DESC);

-- Partitioning for time-series data (optional, for large deployments)
-- Uncomment if you expect high volume of health data
/*
CREATE TABLE dvr_nvr_health_2026_01 PARTITION OF dvr_nvr_health
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
  
CREATE TABLE dvr_nvr_health_2026_02 PARTITION OF dvr_nvr_health
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
*/

-- Create materialized view for quick statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS dvr_nvr_health_summary AS
SELECT 
  device_id,
  status,
  MAX(timestamp) as last_seen,
  AVG(latency_ms) as avg_latency_ms,
  COUNT(*) as health_check_count,
  SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_count,
  SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline_count,
  SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END) as degraded_count,
  ROUND(
    (SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END)::DECIMAL / COUNT(*)::DECIMAL * 100),
    2
  ) as uptime_percentage
FROM dvr_nvr_health
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY device_id, status;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dvr_nvr_health_summary_device_status
  ON dvr_nvr_health_summary(device_id, status);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_dvr_nvr_health_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY dvr_nvr_health_summary;
END;
$$ LANGUAGE plpgsql;

-- Scheduled job to refresh summary (requires pg_cron extension)
-- SELECT cron.schedule('refresh-dvr-nvr-summary', '*/5 * * * *', $$SELECT refresh_dvr_nvr_health_summary()$$);

-- Data retention policy (delete health data older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_dvr_nvr_health()
RETURNS void AS $$
BEGIN
  DELETE FROM dvr_nvr_health
  WHERE timestamp < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Scheduled cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-dvr-nvr-health', '0 2 * * *', $$SELECT cleanup_old_dvr_nvr_health()$$);

-- Trigger to update device_inventory last_communication
CREATE OR REPLACE FUNCTION update_device_last_communication()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'online' THEN
    UPDATE device_inventory
    SET last_communication = NEW.timestamp::TEXT,
        health_status = 'online'
    WHERE id = NEW.device_id;
  ELSIF NEW.status = 'offline' THEN
    UPDATE device_inventory
    SET health_status = 'offline'
    WHERE id = NEW.device_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dvr_nvr_health_update_device
  AFTER INSERT ON dvr_nvr_health
  FOR EACH ROW
  EXECUTE FUNCTION update_device_last_communication();

-- Comments
COMMENT ON TABLE dvr_nvr_health IS 'Continuous health monitoring data for DVR/NVR devices';
COMMENT ON COLUMN dvr_nvr_health.device_id IS 'Reference to device_inventory.id';
COMMENT ON COLUMN dvr_nvr_health.status IS 'Current device status (online, offline, degraded)';
COMMENT ON COLUMN dvr_nvr_health.latency_ms IS 'Network latency in milliseconds';
COMMENT ON COLUMN dvr_nvr_health.hdd_status IS 'JSON array of HDD status information';
COMMENT ON COLUMN dvr_nvr_health.recording_status IS 'Current recording status (recording, stopped, error)';
COMMENT ON COLUMN dvr_nvr_health.uptime IS 'Device uptime in seconds';
