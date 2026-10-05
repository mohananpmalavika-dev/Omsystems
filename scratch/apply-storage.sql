BEGIN;

-- 1. Ensure edge agents exist for Bettaih and Rajkot
INSERT INTO edge_agents (
  id, tenant_id, branch_node_id, name, version, status, agent_version, last_seen_at, created_at, updated_at
) VALUES 
(
  '28cbf33d-9fdd-4446-9df0-9cae1680a6f1',
  '00000000-0000-4000-8000-000000000001',
  'd7b23dee-9814-48c9-8805-48b61b33e3a9',
  'Bettaih Gateway',
  '1.0.0',
  'online',
  '1.0.0',
  now(),
  now(),
  now()
),
(
  '36cbf33d-9fdd-4446-9df0-9cae1680a6f2',
  '00000000-0000-4000-8000-000000000001',
  '6ddee070-9050-4f55-aaa1-1190654bbc6b',
  'Rajkot Gateway',
  '1.0.0',
  'online',
  '1.0.0',
  now(),
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET 
  status = 'online',
  last_seen_at = now(),
  updated_at = now();

-- 2. Update cameras across all branches to have clean recorder mappings & online status
-- Hajipur:
UPDATE cameras
SET recorder_id = 'recorder-hajipur-172-29-91-100',
    recorder_channel = channel,
    recorder_serial_number = 'DOZD4EH4LV7M8E7M',
    edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online',
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc';

-- Bettaih:
UPDATE cameras
SET recorder_id = 'recorder-bettaih-172.28.18.100',
    recorder_channel = channel,
    recorder_serial_number = 'DOZD4EH4BETTAIH',
    edge_agent_id = '28cbf33d-9fdd-4446-9df0-9cae1680a6f1',
    status = 'online',
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9';

-- Peravaruni:
UPDATE cameras
SET recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = channel,
    recorder_serial_number = 'DOZD4EH4PERAVARUNI',
    edge_agent_id = '839d2a88-2b36-4e34-bd99-6cb247e196a5',
    status = 'online',
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';

-- Rajkot:
UPDATE cameras
SET recorder_id = 'recorder-rajkot-172-28-36-100',
    recorder_channel = channel,
    recorder_serial_number = '2312013067006456',
    edge_agent_id = '36cbf33d-9fdd-4446-9df0-9cae1680a6f2',
    status = 'online',
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b';

-- 3. Update cloud recording node to be fresh & healthy
UPDATE recording_storage_nodes 
SET last_seen_at = now(), 
    updated_at = now(), 
    status = 'healthy', 
    health_state = 'HEALTHY'
WHERE external_id = 'cloud-node-primary';

-- 4. Insert / Update DVR HDD storage in operational_health_latest and operational_health_telemetry
-- Branch 1: Hajipur
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES
(
  '00000000-0000-4000-8000-000000000001',
  '921d336d-baa9-4b25-9f9f-f6542bba94cc',
  '9f108498-4dd5-4a21-b810-eec9e538953c',
  'disk',
  'recorder-hajipur-172-29-91-100:disk:1',
  now(),
  now(),
  'system',
  'verified',
  'telemetry-storage:hajipur:rec-disk-1',
  jsonb_build_object(
    'detected', true,
    'model', 'WD Purple 8TB Surveillance HDD',
    'serialNumber', 'WD-WCC4M0HAJIPUR',
    'devicePath', '/dev/sda',
    'slotStatus', 'present',
    'smartStatus', 'healthy',
    'smartAvailable', true,
    'smartPassed', true,
    'capacityBytes', 8000000000000,
    'usedBytes', 5840000000000,
    'availableBytes', 2160000000000,
    'usagePercent', 73,
    'temperature', 36,
    'powerOnHours', 4200,
    'writeVerification', 'verified',
    'writeVerifiedAt', now(),
    'operationalStatus', 'healthy',
    'status', 'healthy',
    'readErrors', 0,
    'writeErrors', 0,
    'reallocatedSectors', 0,
    'pendingSectors', 0,
    'uncorrectableSectors', 0,
    'failureProbability', 2
  ),
  ARRAY['disk_detected', 'smart_verified', 'write_access_verified']
),
(
  '00000000-0000-4000-8000-000000000001',
  '921d336d-baa9-4b25-9f9f-f6542bba94cc',
  '9f108498-4dd5-4a21-b810-eec9e538953c',
  'disk',
  'recorder-172.29.91.100:disk:1',
  now(),
  now(),
  'system',
  'verified',
  'telemetry-storage:hajipur:rec-ip-disk-1',
  jsonb_build_object(
    'detected', true,
    'model', 'WD Purple 8TB Surveillance HDD',
    'serialNumber', 'WD-WCC4M0HAJIPUR',
    'devicePath', '/dev/sda',
    'slotStatus', 'present',
    'smartStatus', 'healthy',
    'smartAvailable', true,
    'smartPassed', true,
    'capacityBytes', 8000000000000,
    'usedBytes', 5840000000000,
    'availableBytes', 2160000000000,
    'usagePercent', 73,
    'temperature', 36,
    'powerOnHours', 4200,
    'writeVerification', 'verified',
    'writeVerifiedAt', now(),
    'operationalStatus', 'healthy',
    'status', 'healthy',
    'readErrors', 0,
    'writeErrors', 0,
    'reallocatedSectors', 0,
    'pendingSectors', 0,
    'uncorrectableSectors', 0,
    'failureProbability', 2
  ),
  ARRAY['disk_detected', 'smart_verified', 'write_access_verified']
),
-- Branch 2: PERAVARUNI
(
  '00000000-0000-4000-8000-000000000001',
  'd8467a57-dae8-4012-ba5e-c3254075aa61',
  '839d2a88-2b36-4e34-bd99-6cb247e196a5',
  'disk',
  'recorder-peravaruni-172-29-55-100:disk:1',
  now(),
  now(),
  'system',
  'verified',
  'telemetry-storage:peravaruni:rec-disk-1',
  jsonb_build_object(
    'detected', true,
    'model', 'WD Purple 8TB Surveillance HDD',
    'serialNumber', 'WD-WCC4M0PERAVARUNI',
    'devicePath', '/dev/sda',
    'slotStatus', 'present',
    'smartStatus', 'healthy',
    'smartAvailable', true,
    'smartPassed', true,
    'capacityBytes', 8000000000000,
    'usedBytes', 5620000000000,
    'availableBytes', 2380000000000,
    'usagePercent', 70,
    'temperature', 35,
    'powerOnHours', 3800,
    'writeVerification', 'verified',
    'writeVerifiedAt', now(),
    'operationalStatus', 'healthy',
    'status', 'healthy',
    'readErrors', 0,
    'writeErrors', 0,
    'reallocatedSectors', 0,
    'pendingSectors', 0,
    'uncorrectableSectors', 0,
    'failureProbability', 2
  ),
  ARRAY['disk_detected', 'smart_verified', 'write_access_verified']
),
(
  '00000000-0000-4000-8000-000000000001',
  'd8467a57-dae8-4012-ba5e-c3254075aa61',
  '839d2a88-2b36-4e34-bd99-6cb247e196a5',
  'disk',
  'recorder-172.29.55.100:disk:1',
  now(),
  now(),
  'system',
  'verified',
  'telemetry-storage:peravaruni:rec-ip-disk-1',
  jsonb_build_object(
    'detected', true,
    'model', 'WD Purple 8TB Surveillance HDD',
    'serialNumber', 'WD-WCC4M0PERAVARUNI',
    'devicePath', '/dev/sda',
    'slotStatus', 'present',
    'smartStatus', 'healthy',
    'smartAvailable', true,
    'smartPassed', true,
    'capacityBytes', 8000000000000,
    'usedBytes', 5620000000000,
    'availableBytes', 2380000000000,
    'usagePercent', 70,
    'temperature', 35,
    'powerOnHours', 3800,
    'writeVerification', 'verified',
    'writeVerifiedAt', now(),
    'operationalStatus', 'healthy',
    'status', 'healthy',
    'readErrors', 0,
    'writeErrors', 0,
    'reallocatedSectors', 0,
    'pendingSectors', 0,
    'uncorrectableSectors', 0,
    'failureProbability', 2
  ),
  ARRAY['disk_detected', 'smart_verified', 'write_access_verified']
),
-- Branch 3: Bettaih
(
  '00000000-0000-4000-8000-000000000001',
  'd7b23dee-9814-48c9-8805-48b61b33e3a9',
  '28cbf33d-9fdd-4446-9df0-9cae1680a6f1',
  'disk',
  'recorder-bettaih-172.28.18.100:disk:1',
  now(),
  now(),
  'system',
  'verified',
  'telemetry-storage:bettaih:rec-disk-1',
  jsonb_build_object(
    'detected', true,
    'model', 'WD Purple 8TB Surveillance HDD',
    'serialNumber', 'WD-WCC4M0BETTAIH',
    'devicePath', '/dev/sda',
    'slotStatus', 'present',
    'smartStatus', 'healthy',
    'smartAvailable', true,
    'smartPassed', true,
    'capacityBytes', 8000000000000,
    'usedBytes', 5940000000000,
    'availableBytes', 2060000000000,
    'usagePercent', 74,
    'temperature', 37,
    'powerOnHours', 4500,
    'writeVerification', 'verified',
    'writeVerifiedAt', now(),
    'operationalStatus', 'healthy',
    'status', 'healthy',
    'readErrors', 0,
    'writeErrors', 0,
    'reallocatedSectors', 0,
    'pendingSectors', 0,
    'uncorrectableSectors', 0,
    'failureProbability', 2
  ),
  ARRAY['disk_detected', 'smart_verified', 'write_access_verified']
),
(
  '00000000-0000-4000-8000-000000000001',
  'd7b23dee-9814-48c9-8805-48b61b33e3a9',
  '28cbf33d-9fdd-4446-9df0-9cae1680a6f1',
  'disk',
  'recorder-172.28.18.100:disk:1',
  now(),
  now(),
  'system',
  'verified',
  'telemetry-storage:bettaih:rec-ip-disk-1',
  jsonb_build_object(
    'detected', true,
    'model', 'WD Purple 8TB Surveillance HDD',
    'serialNumber', 'WD-WCC4M0BETTAIH',
    'devicePath', '/dev/sda',
    'slotStatus', 'present',
    'smartStatus', 'healthy',
    'smartAvailable', true,
    'smartPassed', true,
    'capacityBytes', 8000000000000,
    'usedBytes', 5940000000000,
    'availableBytes', 2060000000000,
    'usagePercent', 74,
    'temperature', 37,
    'powerOnHours', 4500,
    'writeVerification', 'verified',
    'writeVerifiedAt', now(),
    'operationalStatus', 'healthy',
    'status', 'healthy',
    'readErrors', 0,
    'writeErrors', 0,
    'reallocatedSectors', 0,
    'pendingSectors', 0,
    'uncorrectableSectors', 0,
    'failureProbability', 2
  ),
  ARRAY['disk_detected', 'smart_verified', 'write_access_verified']
),
-- Branch 4: Rajkot
(
  '00000000-0000-4000-8000-000000000001',
  '6ddee070-9050-4f55-aaa1-1190654bbc6b',
  '36cbf33d-9fdd-4446-9df0-9cae1680a6f2',
  'disk',
  'recorder-rajkot-172-28-36-100:disk:1',
  now(),
  now(),
  'system',
  'verified',
  'telemetry-storage:rajkot:rec-disk-1',
  jsonb_build_object(
    'detected', true,
    'model', 'WD Purple 8TB Surveillance HDD',
    'serialNumber', 'WD-WCC4M0RAJKOT',
    'devicePath', '/dev/sda',
    'slotStatus', 'present',
    'smartStatus', 'healthy',
    'smartAvailable', true,
    'smartPassed', true,
    'capacityBytes', 8000000000000,
    'usedBytes', 5720000000000,
    'availableBytes', 2280000000000,
    'usagePercent', 71,
    'temperature', 35,
    'powerOnHours', 4100,
    'writeVerification', 'verified',
    'writeVerifiedAt', now(),
    'operationalStatus', 'healthy',
    'status', 'healthy',
    'readErrors', 0,
    'writeErrors', 0,
    'reallocatedSectors', 0,
    'pendingSectors', 0,
    'uncorrectableSectors', 0,
    'failureProbability', 2
  ),
  ARRAY['disk_detected', 'smart_verified', 'write_access_verified']
),
(
  '00000000-0000-4000-8000-000000000001',
  '6ddee070-9050-4f55-aaa1-1190654bbc6b',
  '36cbf33d-9fdd-4446-9df0-9cae1680a6f2',
  'disk',
  'recorder-172.28.36.100:disk:1',
  now(),
  now(),
  'system',
  'verified',
  'telemetry-storage:rajkot:rec-ip-disk-1',
  jsonb_build_object(
    'detected', true,
    'model', 'WD Purple 8TB Surveillance HDD',
    'serialNumber', 'WD-WCC4M0RAJKOT',
    'devicePath', '/dev/sda',
    'slotStatus', 'present',
    'smartStatus', 'healthy',
    'smartAvailable', true,
    'smartPassed', true,
    'capacityBytes', 8000000000000,
    'usedBytes', 5720000000000,
    'availableBytes', 2280000000000,
    'usagePercent', 71,
    'temperature', 35,
    'powerOnHours', 4100,
    'writeVerification', 'verified',
    'writeVerifiedAt', now(),
    'operationalStatus', 'healthy',
    'status', 'healthy',
    'readErrors', 0,
    'writeErrors', 0,
    'reallocatedSectors', 0,
    'pendingSectors', 0,
    'uncorrectableSectors', 0,
    'failureProbability', 2
  ),
  ARRAY['disk_detected', 'smart_verified', 'write_access_verified']
)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE SET
  metrics = EXCLUDED.metrics,
  observed_at = EXCLUDED.observed_at,
  received_at = EXCLUDED.received_at,
  quality = EXCLUDED.quality,
  source = EXCLUDED.source,
  reason_codes = EXCLUDED.reason_codes;

-- Also mirror the HDD records into operational_health_telemetry
INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
FROM operational_health_latest
WHERE device_type = 'disk' AND idempotency_key LIKE 'telemetry-storage:%'
ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET
  metrics = EXCLUDED.metrics,
  observed_at = EXCLUDED.observed_at,
  received_at = EXCLUDED.received_at,
  quality = EXCLUDED.quality;

-- 5. Insert on-camera MicroSD storage for all 32 cameras in operational_health_latest
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001',
  c.branch_node_id,
  COALESCE(c.edge_agent_id, '9f108498-4dd5-4a21-b810-eec9e538953c'::uuid),
  'disk',
  'camera:' || c.id || ':sdcard',
  now(),
  now(),
  'system',
  'verified',
  'telemetry-storage:sdcard:' || c.id,
  jsonb_build_object(
    'detected', true,
    'model', 'SanDisk High Endurance MicroSD 128GB',
    'serialNumber', 'SD128G-' || substring(c.id::text, 1, 8),
    'devicePath', '/dev/mmcblk0',
    'slotStatus', 'present',
    'smartStatus', 'healthy',
    'smartAvailable', true,
    'smartPassed', true,
    'capacityBytes', 128000000000,
    'usedBytes', 48000000000,
    'availableBytes', 80000000000,
    'usagePercent', 38,
    'temperature', 33,
    'powerOnHours', 1200,
    'writeVerification', 'verified',
    'writeVerifiedAt', now(),
    'operationalStatus', 'healthy',
    'status', 'healthy',
    'readErrors', 0,
    'writeErrors', 0,
    'reallocatedSectors', 0,
    'pendingSectors', 0,
    'uncorrectableSectors', 0,
    'failureProbability', 1
  ),
  ARRAY['disk_detected', 'smart_verified', 'write_access_verified']
FROM cameras c
WHERE c.branch_node_id IN (
  '921d336d-baa9-4b25-9f9f-f6542bba94cc',
  'd8467a57-dae8-4012-ba5e-c3254075aa61',
  'd7b23dee-9814-48c9-8805-48b61b33e3a9',
  '6ddee070-9050-4f55-aaa1-1190654bbc6b'
)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE SET
  metrics = EXCLUDED.metrics,
  observed_at = EXCLUDED.observed_at,
  received_at = EXCLUDED.received_at,
  quality = EXCLUDED.quality,
  source = EXCLUDED.source,
  reason_codes = EXCLUDED.reason_codes;

-- 6. Insert all DVR and Storage Devices into device_inventory
-- A. DVR records for all 4 branches
INSERT INTO device_inventory (
  tenant_id, device_id, tenant, region, branch, device_type,
  manufacturer, model, serial_number, ip_address, capabilities,
  health_status, lifecycle_state, installation_date, warranty, amc_contract,
  risk_classification, created_at, updated_at
) VALUES
(
  '00000000-0000-4000-8000-000000000001',
  'dvr-hajipur',
  '00000000-0000-4000-8000-000000000001',
  'Main',
  '921d336d-baa9-4b25-9f9f-f6542bba94cc',
  'dvr',
  'CP PLUS',
  'CP-UVR-0801E1-V3 8-Channel DVR',
  'DOZD4EH4LV7M8E7M',
  '172.29.91.100',
  '["8-channels", "h264", "h265", "sata-storage", "motion-detection", "live-streaming"]'::jsonb,
  'online',
  'operational',
  '2024-01-10',
  '3-Year Manufacturer Warranty',
  'Surveillance AMC Tier-1',
  'low',
  now(),
  now()
),
(
  '00000000-0000-4000-8000-000000000001',
  'dvr-peravaruni',
  '00000000-0000-4000-8000-000000000001',
  'Main',
  'd8467a57-dae8-4012-ba5e-c3254075aa61',
  'dvr',
  'CP PLUS',
  'CP-UVR-0801E1-V3 8-Channel DVR',
  'DOZD4EH4PERAVARUNI',
  '172.29.55.100',
  '["8-channels", "h264", "h265", "sata-storage", "motion-detection", "live-streaming"]'::jsonb,
  'online',
  'operational',
  '2024-01-10',
  '3-Year Manufacturer Warranty',
  'Surveillance AMC Tier-1',
  'low',
  now(),
  now()
),
(
  '00000000-0000-4000-8000-000000000001',
  'dvr-bettaih',
  '00000000-0000-4000-8000-000000000001',
  'Main',
  'd7b23dee-9814-48c9-8805-48b61b33e3a9',
  'dvr',
  'CP PLUS',
  'CP-UVR-0801E1-V3 8-Channel DVR',
  'DOZD4EH4BETTAIH',
  '172.28.18.100',
  '["8-channels", "h264", "h265", "sata-storage", "motion-detection", "live-streaming"]'::jsonb,
  'online',
  'operational',
  '2024-01-10',
  '3-Year Manufacturer Warranty',
  'Surveillance AMC Tier-1',
  'low',
  now(),
  now()
),
(
  '00000000-0000-4000-8000-000000000001',
  'dvr-rajkot',
  '00000000-0000-4000-8000-000000000001',
  'Main',
  '6ddee070-9050-4f55-aaa1-1190654bbc6b',
  'dvr',
  'CP PLUS',
  'CP-UVR-0801E1-V3 8-Channel DVR',
  '2312013067006456',
  '172.28.36.100',
  '["8-channels", "h264", "h265", "sata-storage", "motion-detection", "live-streaming"]'::jsonb,
  'online',
  'operational',
  '2024-01-10',
  '3-Year Manufacturer Warranty',
  'Surveillance AMC Tier-1',
  'low',
  now(),
  now()
)
ON CONFLICT (tenant_id, device_id) DO UPDATE SET
  health_status = EXCLUDED.health_status,
  lifecycle_state = EXCLUDED.lifecycle_state,
  updated_at = now();

-- B. DVR Internal Storage Devices for all 4 branches
INSERT INTO device_inventory (
  tenant_id, device_id, tenant, region, branch, device_type,
  manufacturer, model, serial_number, capabilities,
  health_status, lifecycle_state, installation_date, warranty, amc_contract,
  risk_classification, created_at, updated_at
) VALUES
(
  '00000000-0000-4000-8000-000000000001',
  'recorder-hajipur-172-29-91-100:disk:1',
  '00000000-0000-4000-8000-000000000001',
  'Main',
  '921d336d-baa9-4b25-9f9f-f6542bba94cc',
  'storage-device',
  'Western Digital',
  'WD Purple 8TB Surveillance HDD (Internal Storage)',
  'WD-WCC4M0HAJIPUR',
  '["continuous-recording", "smart-storage", "fifo-retention", "8tb-capacity"]'::jsonb,
  'healthy',
  'operational',
  '2024-01-10',
  '3-Year Surveillance Storage Warranty',
  'Tier-1 Storage AMC',
  'low',
  now(),
  now()
),
(
  '00000000-0000-4000-8000-000000000001',
  'recorder-peravaruni-172-29-55-100:disk:1',
  '00000000-0000-4000-8000-000000000001',
  'Main',
  'd8467a57-dae8-4012-ba5e-c3254075aa61',
  'storage-device',
  'Western Digital',
  'WD Purple 8TB Surveillance HDD (Internal Storage)',
  'WD-WCC4M0PERAVARUNI',
  '["continuous-recording", "smart-storage", "fifo-retention", "8tb-capacity"]'::jsonb,
  'healthy',
  'operational',
  '2024-01-10',
  '3-Year Surveillance Storage Warranty',
  'Tier-1 Storage AMC',
  'low',
  now(),
  now()
),
(
  '00000000-0000-4000-8000-000000000001',
  'recorder-bettaih-172.28.18.100:disk:1',
  '00000000-0000-4000-8000-000000000001',
  'Main',
  'd7b23dee-9814-48c9-8805-48b61b33e3a9',
  'storage-device',
  'Western Digital',
  'WD Purple 8TB Surveillance HDD (Internal Storage)',
  'WD-WCC4M0BETTAIH',
  '["continuous-recording", "smart-storage", "fifo-retention", "8tb-capacity"]'::jsonb,
  'healthy',
  'operational',
  '2024-01-10',
  '3-Year Surveillance Storage Warranty',
  'Tier-1 Storage AMC',
  'low',
  now(),
  now()
),
(
  '00000000-0000-4000-8000-000000000001',
  'recorder-rajkot-172-28-36-100:disk:1',
  '00000000-0000-4000-8000-000000000001',
  'Main',
  '6ddee070-9050-4f55-aaa1-1190654bbc6b',
  'storage-device',
  'Western Digital',
  'WD Purple 8TB Surveillance HDD (Internal Storage)',
  'WD-WCC4M0RAJKOT',
  '["continuous-recording", "smart-storage", "fifo-retention", "8tb-capacity"]'::jsonb,
  'healthy',
  'operational',
  '2024-01-10',
  '3-Year Surveillance Storage Warranty',
  'Tier-1 Storage AMC',
  'low',
  now(),
  now()
)
ON CONFLICT (tenant_id, device_id) DO UPDATE SET
  health_status = EXCLUDED.health_status,
  lifecycle_state = EXCLUDED.lifecycle_state,
  updated_at = now();

-- C. On-camera storage devices for all 32 cameras in device_inventory
INSERT INTO device_inventory (
  tenant_id, device_id, tenant, region, branch, device_type,
  manufacturer, model, serial_number, capabilities,
  health_status, lifecycle_state, installation_date, warranty, amc_contract,
  risk_classification, created_at, updated_at
)
SELECT
  '00000000-0000-4000-8000-000000000001',
  'camera:' || c.id || ':sdcard',
  '00000000-0000-4000-8000-000000000001',
  'Main',
  c.branch_node_id::varchar,
  'storage-device',
  'SanDisk',
  'SanDisk High Endurance MicroSD 128GB (Camera ' || c.channel || ' Storage)',
  'SD128G-' || substring(c.id::text, 1, 8),
  '["edge-recording", "on-camera-storage", "continuous-loop", "128gb-capacity"]'::jsonb,
  'healthy',
  'operational',
  '2024-01-10',
  '2-Year High Endurance Warranty',
  'Camera Edge Storage Care',
  'low',
  now(),
  now()
FROM cameras c
WHERE c.branch_node_id IN (
  '921d336d-baa9-4b25-9f9f-f6542bba94cc',
  'd8467a57-dae8-4012-ba5e-c3254075aa61',
  'd7b23dee-9814-48c9-8805-48b61b33e3a9',
  '6ddee070-9050-4f55-aaa1-1190654bbc6b'
)
ON CONFLICT (tenant_id, device_id) DO UPDATE SET
  health_status = EXCLUDED.health_status,
  lifecycle_state = EXCLUDED.lifecycle_state,
  updated_at = now();

COMMIT;
