BEGIN;

INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('748eeb31-76f8-43e9-9121-4c1d99166e87', '525198ad-504d-48af-ac6c-dca057d38ed5', '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '["172.28.18.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'other',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    recorder_channel = 1,
    recorder_id = NULL,
    ip_address = '172.28.18.100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch1',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'b7a24b40-013d-40c9-bd46-823cbcf6e326';

UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 1',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = 'a7424e2e-d7e9-4a28-9977-9c1bcb4d0488';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch1',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'c77af473-31e3-4193-834a-1110dc2d4a0c';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'b7a24b40-013d-40c9-bd46-823cbcf6e326',
  now(), now(), 'rtsp', 'verified', 'kollam-online-b7a24b40-013d-40c9-bd46-823cbcf6e326',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":85,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'other',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    recorder_channel = 2,
    recorder_id = NULL,
    ip_address = '172.28.18.100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch2',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53';

UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 2',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '0c85e2ef-bf0b-4b42-943f-2ded62fda091';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch2',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'dcbb3522-a0fa-418c-b77c-b91030a9cc93';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53',
  now(), now(), 'rtsp', 'verified', 'kollam-online-c7ef14ba-67eb-4d15-a173-9c56d51bbb53',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":85,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'other',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    recorder_channel = 3,
    recorder_id = NULL,
    ip_address = '172.28.18.100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch3',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'da907692-01fd-4bf4-b305-f7259c05c887';

UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 3',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '7af59f91-5fd6-4fa0-9fcb-5f5b79f98872';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch3',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    last_seen_at = now(),
    updated_at = now()
WHERE id = '6933b508-1766-43c4-a395-014699fac166';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'da907692-01fd-4bf4-b305-f7259c05c887',
  now(), now(), 'rtsp', 'verified', 'kollam-online-da907692-01fd-4bf4-b305-f7259c05c887',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":85,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'other',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    recorder_channel = 4,
    recorder_id = NULL,
    ip_address = '172.28.18.100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch4',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '3da93c6e-6824-43dc-9bba-7332707d5856';

UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 4',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '3cf62a1f-1558-44cc-b9d7-93835f97f213';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch4',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'd8e56908-1913-422d-9947-31a960096bc7';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '3da93c6e-6824-43dc-9bba-7332707d5856',
  now(), now(), 'rtsp', 'verified', 'kollam-online-3da93c6e-6824-43dc-9bba-7332707d5856',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":85,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'other',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    recorder_channel = 5,
    recorder_id = NULL,
    ip_address = '172.28.18.100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch5',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'cf27a4e8-23e4-4c4a-8e57-b49eef8302b2';

UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 5',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '87e5d259-96d9-4efa-87a5-6828fb8cc271';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch5',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'c8da8d72-34bb-4abc-8f5c-029615dfed11';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'cf27a4e8-23e4-4c4a-8e57-b49eef8302b2',
  now(), now(), 'rtsp', 'verified', 'kollam-online-cf27a4e8-23e4-4c4a-8e57-b49eef8302b2',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":85,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'other',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    recorder_channel = 6,
    recorder_id = NULL,
    ip_address = '172.28.18.100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch6',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'c365a8e7-68a8-44bb-a63f-aae73dca7526';

UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 6',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = '7a4787fc-ebd5-466c-a588-e20ef7b96a47';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch6',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    last_seen_at = now(),
    updated_at = now()
WHERE id = '7bf9d9c5-9140-4c96-9ea9-0fe2c460092a';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'c365a8e7-68a8-44bb-a63f-aae73dca7526',
  now(), now(), 'rtsp', 'verified', 'kollam-online-c365a8e7-68a8-44bb-a63f-aae73dca7526',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":85,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'other',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    recorder_channel = 7,
    recorder_id = NULL,
    ip_address = '172.28.18.100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch7',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '99455d3a-3411-43ad-b756-84a4ae17c026';

UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 7',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = 'dd415479-6fe2-49ed-9673-056741637411';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch7',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    last_seen_at = now(),
    updated_at = now()
WHERE id = '82e3f62d-6317-4929-9b95-829ce27f4740';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '99455d3a-3411-43ad-b756-84a4ae17c026',
  now(), now(), 'rtsp', 'verified', 'kollam-online-99455d3a-3411-43ad-b756-84a4ae17c026',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":85,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'other',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    recorder_channel = 8,
    recorder_id = NULL,
    ip_address = '172.28.18.100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch8',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d';

UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 8',
    is_active = true,
    lifecycle_status = 'ACTIVE',
    updated_at = now()
WHERE id = 'eb0b3c48-4033-40d7-a1e1-2c4a7f1c5dc5';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch8',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    last_seen_at = now(),
    updated_at = now()
WHERE id = '3838fa28-6e1e-44d2-a15c-47911f765265';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d',
  now(), now(), 'rtsp', 'verified', 'kollam-online-fb465a8f-5d79-4a3f-9cb8-b8cec471708d',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":85,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];

COMMIT;