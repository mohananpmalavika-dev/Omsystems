DELETE FROM operational_health_telemetry WHERE device_type = 'disk';
DELETE FROM operational_health_latest WHERE device_type = 'disk';
DELETE FROM recording_storage_nodes WHERE external_id IN ('cam-sdcard-primary', 'dvr-hdd-primary');
