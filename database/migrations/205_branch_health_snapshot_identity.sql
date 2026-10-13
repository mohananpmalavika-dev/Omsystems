-- Branch summaries share the historical per-device health table. Give them an
-- explicit type while retaining identity and metrics requirements for devices.
ALTER TABLE device_health_snapshots
  DROP CONSTRAINT IF EXISTS device_health_snapshots_device_type_check;
ALTER TABLE device_health_snapshots
  ADD CONSTRAINT device_health_snapshots_device_type_check
  CHECK (device_type IN ('recorder', 'disk', 'camera', 'network', 'ups', 'branch'));
