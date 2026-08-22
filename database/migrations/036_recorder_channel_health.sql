-- Preserve per-channel recorder evidence independently from aggregate recorder
-- telemetry. This allows channel state to be queried without replacing camera
-- heartbeat or recorder-level health rows.
ALTER TABLE operational_health_telemetry
  DROP CONSTRAINT IF EXISTS operational_health_telemetry_device_type_check;

ALTER TABLE operational_health_telemetry
  ADD CONSTRAINT operational_health_telemetry_device_type_check
  CHECK (device_type IN ('branch','edge-agent','recorder','recorder-channel','archive','camera','disk','network','ups'));

COMMENT ON COLUMN operational_health_telemetry.metrics IS
  'Normalized health metrics. recorder-channel rows carry channel-scoped recording/connectivity evidence; archive rows carry direct retention evidence.';
