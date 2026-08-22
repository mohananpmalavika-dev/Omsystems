-- Direct recorder archive scans are stored alongside operational telemetry but
-- use their own device type so camera heartbeat telemetry is never overwritten.
ALTER TABLE operational_health_telemetry
  DROP CONSTRAINT IF EXISTS operational_health_telemetry_device_type_check;

ALTER TABLE operational_health_telemetry
  ADD CONSTRAINT operational_health_telemetry_device_type_check
  CHECK (device_type IN ('branch','edge-agent','recorder','archive','camera','disk','network','ups'));

COMMENT ON COLUMN operational_health_telemetry.metrics IS
  'Normalized health metrics. archive rows carry direct, channel-scoped DVR/NVR retention evidence.';
