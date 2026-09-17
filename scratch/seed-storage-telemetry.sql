INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES 
(
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000104',
  '4aa4b7a3-2262-4581-9e2b-89d0ed673b1b',
  'disk',
  'disk-sdcard-cam01',
  now(),
  now(),
  'system',
  'verified',
  'disk-sdcard-cam01-v1',
  '{"detected": true, "state": "present", "smartPassed": true, "smartAvailable": true, "smartStatus": "healthy", "capacityBytes": 128000000000, "usedBytes": 45000000000, "freeBytes": 83000000000, "usagePercent": 35, "serialNumber": "SD128G-HIGH-ENDURANCE", "model": "SanDisk High Endurance MicroSD 128GB", "slot": "CAM-01-SD", "temperature": 34, "powerOnHours": 720}'::jsonb,
  ARRAY[]::text[]
),
(
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000104',
  '4aa4b7a3-2262-4581-9e2b-89d0ed673b1b',
  'disk',
  'disk-sata-dvr01',
  now(),
  now(),
  'system',
  'verified',
  'disk-sata-dvr01-v1',
  '{"detected": true, "state": "present", "smartPassed": true, "smartAvailable": true, "smartStatus": "healthy", "capacityBytes": 8000000000000, "usedBytes": 6420000000000, "freeBytes": 1580000000000, "usagePercent": 80, "serialNumber": "WD-WCC4M0SURVEILLANCE", "model": "WD Purple 8TB Surveillance HDD", "slot": "DVR-SATA-01", "temperature": 38, "powerOnHours": 3450}'::jsonb,
  ARRAY[]::text[]
),
(
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000104',
  '4aa4b7a3-2262-4581-9e2b-89d0ed673b1b',
  'disk',
  'disk-cloud-s3',
  now(),
  now(),
  'system',
  'verified',
  'disk-cloud-s3-v1',
  '{"detected": true, "state": "present", "smartPassed": true, "smartAvailable": true, "smartStatus": "healthy", "capacityBytes": 500000000000, "usedBytes": 42000000000, "freeBytes": 458000000000, "usagePercent": 8, "serialNumber": "SENTINEL-CLOUD-S3-POOL", "model": "Sentinel Online Cloud Recording Pool", "slot": "CLOUD-S3-01", "temperature": 26, "powerOnHours": 9999}'::jsonb,
  ARRAY[]::text[]
)
ON CONFLICT (tenant_id, idempotency_key) DO UPDATE 
SET metrics = EXCLUDED.metrics, observed_at = now(), received_at = now();
