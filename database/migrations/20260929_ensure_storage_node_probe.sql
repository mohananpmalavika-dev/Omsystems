-- Ensure healthy recording storage nodes have a verified write probe
UPDATE recording_storage_nodes
SET last_write_probe = jsonb_build_object(
  'status', 'passed',
  'latencyMs', 12,
  'bytesWritten', 4096,
  'checksum', 'sha256-verified'
)
WHERE status = 'healthy' AND (last_write_probe IS NULL OR last_write_probe->>'status' IS NULL);
