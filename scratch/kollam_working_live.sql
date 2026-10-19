BEGIN;

INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('748eeb31-76f8-43e9-9121-4c1d99166e87', '525198ad-504d-48af-ac6c-dca057d38ed5', '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '["172.28.18.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    recorder_channel = 1,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch1',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'b7a24b40-013d-40c9-bd46-823cbcf6e326';

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
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    recorder_channel = 2,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch2',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53';

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
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    recorder_channel = 3,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch3',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'da907692-01fd-4bf4-b305-f7259c05c887';

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
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    recorder_channel = 4,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch4',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '3da93c6e-6824-43dc-9bba-7332707d5856';

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
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    recorder_channel = 5,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch5',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'cf27a4e8-23e4-4c4a-8e57-b49eef8302b2';

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
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    recorder_channel = 6,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch6',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'c365a8e7-68a8-44bb-a63f-aae73dca7526';

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
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    recorder_channel = 7,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch7',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '99455d3a-3411-43ad-b756-84a4ae17c026';

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
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    recorder_channel = 8,
    recorder_id = 'recorder-kollam-192-168-1-33',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/bettaih-ch8',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d';

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