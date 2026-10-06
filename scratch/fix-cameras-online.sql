BEGIN;

INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('9f108498-4dd5-4a21-b810-eec9e538953c', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '["172.28.18.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('9f108498-4dd5-4a21-b810-eec9e538953c', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '["172.29.91.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('9f108498-4dd5-4a21-b810-eec9e538953c', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '["172.29.55.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('9f108498-4dd5-4a21-b810-eec9e538953c', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '["172.28.36.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', '7GIPFvu5j4WwLmq7huL6FQHRLAxVQ0vgx7AxRnNRHcLc/6QXHtS22WlmA6eCFBtrtEZlsYy4QH0dGiGGSeqTScMxHcXv7h1XX8eGn+YkB55lAMmiDoa5eD2S98xltB3KyD5qZA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'nrmzIb3BmmCqkYKECMRZ5YO/n6n7vmxEZqmN5lphGcjk0G4LqNvfa8qZ5IRZXIotZVXrZZdbKZk2lYFfGSAUVk+Vj2JJGqs1I2//Aj8+DJVpRJmpWk8wN5i+JMkKqUvtJa4KYw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'TB83j0GoYYX4ISRJBPotn/mTEP8vHYwVWifSDZvTWOhGy548n91TiTQOCyaylk3DsIUym8HxKkCf5RmeeN3vdgLXJipuKPXtbVAgIUoMY6PuxXYQo1BpFaC57z0zA6QNd2L3aw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1',
    connection_transport = 'edge-gateway',
    recorder_channel = 1,
    channel = 1,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 1 OR channel = 1);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1',
    channel = 1,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 1;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 1 OR c.channel = 1)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 1 OR c.channel = 1);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', 'OZfKXYV5hQ6k4Z61lJ7ZqO16U4wD1n1MIPEDSY8XUJGVbk8UL1eQ86l1R0eg6Z+uHB8ESQ0HsiA/3KXguXhktyF37eqcqeU1gLiD0M6H56vbJXGva+L3ogMurY8ZHg1R3j+ezQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'PFOeAMo3dkOV4kEdJ2NORa/DQF2ZD04zkEha9o+AzXoCJ7qnbIWrLclXBcAQpaez8rodooAos9P7Mo/xsW0bkr6Lfu+L9A2/4shZz46oRu+U6hRqNatVdEZQ4qPZtONtQrdgoA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'WwSgQqNg3E4+edTBV45l8IZ3vOYxtaeXbX0nA9xdNYhqKeKgiDgZJZGjgKXYwouSpUsqS6ubRAJQnRgmzwkEgsMLYNy83HsZSNBmTS9dvdiXGomY/wvv2dYBmqKyxWaEpS8vng==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2',
    connection_transport = 'edge-gateway',
    recorder_channel = 2,
    channel = 2,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 2 OR channel = 2);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2',
    channel = 2,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 2;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 2 OR c.channel = 2)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 2 OR c.channel = 2);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', 'EFu/MHQDrR1L7bFcsfp+TrQR0qRDdKWXw7cfy4LWk8d7NbNkty8S7+4V5s46cSrPXwcUmoh5beNRiJ7BQXdh0dl3dde+rTUoaH/+nFZlXh5js3PxgLD2Jl/t8WH/618NCRFhLA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'u4VBvIk4oHIdmkR/3EXEGOUvaLcwH6e0yGhB63IGuj1uSfGm4nDAwGdXTI4guN/zDnlB+eWyCI/Yxv1LWXUTNFxyDNp4ZCVYr58SRvPs8xmBg8WATf+KDTQchMIu/AEt9Z3btQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'ey0RKQGYcQsGBdJVGk7rV9w4QJk3NLaCP1YtOVM4EnZg0pmbewAPJS6LQ8QyIk3mTFV71aCQ54eo43pua1idUKwUeVKfpwJenkdtE5pa1plAeZBbXN5o4rgQpdXaeY2csOpXQw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3',
    connection_transport = 'edge-gateway',
    recorder_channel = 3,
    channel = 3,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 3 OR channel = 3);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3',
    channel = 3,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 3;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 3 OR c.channel = 3)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 3 OR c.channel = 3);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', 'NKaaplcqSzyfhCUKQwEi/EMzcyCKmLO58/pMEhEK5trqaYexL1dW9IKed9si5sXsGkxEL2CHiC5uo4ts0FSYoP/ZGdHgRmcE1I+Ln6/RuCK3INr9ioxim0F4GhgfCX40/78KZA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'nFGHQywicSbhJJoIjKzAaYb4ZHkiIXM1nFgtpzCEvtVuYyP1PnB74N+VBm4jNUJF2/A2EsPiGiSBSYbrWhhjeHaOAqmT3MttOGL0XIUXhnRjfdhRmOEcksAF6yALL0dRMvodoA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'fhda/Dtnpq9FNRqRGGydugPDlREK+2tT9ER4/C3uLD4mrdFWtNQhTneVQO2Aq40XqsaVe/MZcUBHUcmOUdwtQT5uSXjva2ZpZf5tUUJSanEc0FXHQCDvDQSDthspb2WFUxLx2Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4',
    connection_transport = 'edge-gateway',
    recorder_channel = 4,
    channel = 4,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 4 OR channel = 4);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4',
    channel = 4,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 4;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 4 OR c.channel = 4)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 4 OR c.channel = 4);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', 'rMyNsIheNQ0ys5HgSlh3llrzyMpcrRNk2Fg4aGqRrUOTgrWQCaeaeiHnXa+0xqC8VrwwmaZQvOCOrn2/ogpqRZelVKZsOHHKjHr6iK5eZi3QO5A/AJWNRdd07o8NMgrOlFFZgw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'UoUtw2bOs8YdFSjfd8z9xWUJj9bKn4lLBHE0F2JT3FR8QV25WrI2bl3ezxmm/Br6w/WyxVvaI/9OFd7t5hufzACg5mhYpRHvh6IB1PQVHYEEPKvVRntlatG83H6S8Wyq1I8K5w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'xOXIf1VSLh/23bPx3oq8eltPPrAnPX9bMstjBxEH77IMv84FW3poA7+w3SljyT/lNK2H9+i0FkJ88QVa5inHROTDeTrYN09S599pbK2DrjzSpnXnqsKF3WgyxCng3ISXbJAgPg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5',
    connection_transport = 'edge-gateway',
    recorder_channel = 5,
    channel = 5,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 5 OR channel = 5);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5',
    channel = 5,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 5;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 5 OR c.channel = 5)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 5 OR c.channel = 5);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', 'gH1eaYDh7OdmBP0xvNqMmDu0wGCQXQT9WmZ1G9MVDbjXnvHcgpf8PFGO186GL07NMqDHE9ii2cyl58hTubmtr2cDH4k+tAomkb9W9wAqc6F7TjAi1lzbLLaJw4ACHaHEdqiRVg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'nzy+VarGzzVrlNkIrN19v9HMSTrfUwRwA1ZJreNMxQuwPm9sZWE+bC8AT6AmVBYc/KH9fif9YLhdvIw7ujQLCDcyIE4mFhCEys0mOdGFNJ8Ygy2XH/iSRjT1EogmGaO9NJGuBQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'u40UKo/JHvfrCiupsAg8kTH/GFLA8cRWzLYUGjjowaINqHjexmTO3jtKEP+eSXxl+3vTkIa7xadWzI+hjlamOA+Ps2k16WrCcrdsKboZAggF/jElESn/EQrZ6VbFAdkIUIBN/g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6',
    connection_transport = 'edge-gateway',
    recorder_channel = 6,
    channel = 6,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 6 OR channel = 6);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6',
    channel = 6,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 6;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 6 OR c.channel = 6)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 6 OR c.channel = 6);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', 'N391Ila5ge79A59bI5lkXGMqXNdmlxRb8494tFuXIf5ahwj/XbNXKab3u5UDwqwiU61LeYvaS5oiVlbmbw2aEnOejVKpHYZmXc0YabkztAMZKAedfhhnWVosNDy7sGlzlh1uGA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Tf9FDWk2al1BHMadJwzapR5/20xRD8XFQqdTdAHvYwhcojJIIz4UbdkWeEvbWrHJVi9cpCDRPYFAZlifK34Q2CIFlZVgfqfYTjHzX26R3STPLLRx08wrbSHFvReFyCY6vp0pjg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'NyVlGKMfCf/x3ASSCW3Dut4zaLNrOB8ssDa3VAH5+tJQ+CJhv5PwBIJao++V17hbOIHjMGvpm/AQ9KK5mEOAVrrP8nc84n7lHBCijVb0/aKm5irlhouqCqOY79qc/ww4IhqjAw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7',
    connection_transport = 'edge-gateway',
    recorder_channel = 7,
    channel = 7,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 7 OR channel = 7);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7',
    channel = 7,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 7;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 7 OR c.channel = 7)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 7 OR c.channel = 7);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', '5hx2Sbipzq9lUFialiVLgquRc4VyvRLOHfjv7WViLgBEIt95mPMqfrc5TuuOr7mkbqYAWoD7OzAFoC6LQwBWGh4CPCxAh8bX3EwG1KXKKAJkbZCa7xcTc7NM5D2brur2ciYUcw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'pgP4Y3cNyI3WE91FLrzDJuM8w0yRE14JPsipeKlk7Z7HSujwocIknOCtGRFx6TMWePu3J+74g9kx+fDR92vKg7APl0O19nR+Ghc67HXQZlqo4VJlcEn4EPE8opXYaoJN9nn7NA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'JPZ7bRxFM7bj1eALNCbK0P7GkyzeQs082Pz6vle9U7XUKWt0a7SByliNnmB3YzOMHIHDfFD2I95eWZTgNCbFBbNX9S/UjVA8RdoPB/DbtPzDBXwOGcgCO9xZkKH/ODZyNMEFLw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8',
    connection_transport = 'edge-gateway',
    recorder_channel = 8,
    channel = 8,
    last_seen_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (recorder_channel = 8 OR channel = 8);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8',
    channel = 8,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND channel = 8;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 8 OR c.channel = 8)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND (c.recorder_channel = 8 OR c.channel = 8);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', 'q9iLc3LsYWc6urj14W2ObvGJxxXlOvXjsPGiKU3zcNpUz9z9E5A5SegdWmxVR+2N6OdNEXUKd6mgepagVpEkSNsq0Pw3+V9IoJ9o9R/bUp8QC5sTG5jIfDuXELXNTbGiCtVDvQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch1#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'NQZ4Vep8TqzUIzvOCrGrllSi3xD57zLnWqg5SI+4qQxHM5kOc3uzXDBH+ETKY6vH+IPYyj2znR1Q6pu2yO4cm7jYrr3AIwgIbhWNz3saCoDY9pALaGMFGFYP2flrn2YNmiHNyg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch1#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'PpSkOgh5pK/8q48N/G6nbVMoJ2PZrNzSTy/kQmAR1OVxCO+j0jUm8/vrKAqr9N2b4o56n6vKWLR2V+LPJYegxcU+mP9GgMobmDDDyWhJ88H4CnIcRZ+ZhFF7LNliaXe+mkWpLA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch1',
    connection_transport = 'edge-gateway',
    recorder_channel = 1,
    channel = 1,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 1 OR channel = 1);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch1',
    channel = 1,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 1;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 1 OR c.channel = 1)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 1 OR c.channel = 1);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', 'nGm7UnLQQgCKkdxrh2enuY8f4JQ/wNTPNEL9+n0KyMoaKbQMMgq/3HVApdhmrM6slTT9m0Fs7SS9/SBx92gMatXho3JI8h1rcKcTnAlL47Elgo0NZgD4yQfGzUYQShCqG78bwQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch2#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'yszBzVjSqvkT6ZVLNkudvT0D125Jmjr//MYYhQQ/v7TZk5tKUCiGXQskiqVPpxb9Ht8aqXc+2UvUvmISGGxYhwO09STfS/Mu60WtXAcE9IpyIpDxM8TmOE3sPiwXKB1V3MpWZA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch2#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '3RRgp9dzwySIpW+KyGEiYylhShxSFG2u4jpdXt6W/s3zPDDdfTJBY8uBegtJaYV0snR6tDyxvrcLqxR8g5FZ3uNVVGH5ydpTY+NzLYsaSbeZLVEmdZZ0Uz5kx8UNiIF2NK6JCA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch2',
    connection_transport = 'edge-gateway',
    recorder_channel = 2,
    channel = 2,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 2 OR channel = 2);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch2',
    channel = 2,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 2;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 2 OR c.channel = 2)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 2 OR c.channel = 2);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', 'KQfyL8BilEjHnWKvf1SHLPq5YvygQdHHUCT3hjzJJmQM5WQosXRBQPnkRTjveWDnLILQAv6KNxlb1BLCIJ4gVJHMNwCA/h8709wZxcvZVuojw3eqiolle/A2gFJXe9A3RWWm6w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch3#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', '84osLUyidjlGQOP+SCTjh16STjr8VcUtLe5AV7xmwIoXpyuqg9fRB7qNl6xwPk8NCrBlozKfEEdsLZzZif+GvIGGPPqyJG4AIRLjK7ltMaf2XnEmNC7QrY5Y1xAjwb5eO3KNOw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch3#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'guW228ZvCTm/B6mVTO93S2IHEn+udV02nQK5eY1aI23pmUyk03DnnvMDEu0V7hAhDCo+h3R6joqc2nwe8uj5Vs0Q5Bz8s/pTeWN/Jwjypcub+vvVbAdtbyeY8M1zS0B3+W/5+A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch3',
    connection_transport = 'edge-gateway',
    recorder_channel = 3,
    channel = 3,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 3 OR channel = 3);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch3',
    channel = 3,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 3;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 3 OR c.channel = 3)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 3 OR c.channel = 3);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', '181XYtTujvrBWf9EuVrC9ZO9T6CFh5vZ6liPC3nukBXIsGxpgYx1a9bZvl1pjBb/6kO42oVDa1PQa31zK3LZ6QYhk7vvupDMTpsbchKpWbl5RVKCBYJOLP7jzD0ST22iWHFFGg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch4#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Qn7KvGVPwbKG84atI86yTy9Ez02OlLCXB7Y7KZlkoW6G/K2M2QInLvmRxufHX3VRSDayjYc+Bqob3QgXTXbyy+hmU1bzV9bFtDUrChqOVZXpcyEyQkT0ws9sf0873P8oiDsMvQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch4#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'ijoXHHlcTocTQBoIGOf6AFUJOr6gkF83PKlNEFxNgGw2MJB5Ehbs5EB7gYr+4nQGOgf8Q/hh/ih8CicXHgDfKdpEyS87fhSXjhLSCQ9ZQt3X5u+d+oFHdxosHrYIcTARwYyi1Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch4',
    connection_transport = 'edge-gateway',
    recorder_channel = 4,
    channel = 4,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 4 OR channel = 4);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch4',
    channel = 4,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 4;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 4 OR c.channel = 4)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 4 OR c.channel = 4);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', '7DmrQt+pPqlMhada0og8Y++I32RE5Se6aVAbW9o1HRnNPqFYeqSUELRSem6U/gpxtTw8ojWV4FRwD46KgsHqQuoSJYrGOKQu5OkNAmv9/WwniiultLHJ2lkCPxvTD/o2499h5w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch5#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'BG2FJG0fe4XG7w9RlgPg1apKuwtfxj1zm1ojiW7vlNxLxDY36z6W/nw33QterXrboeBd73lAkZNAV0U8o9dW5zBOXRkvsoeEwSrmUEIG/KQw/aJhEIAG+whSQUOR8zC8SUbDGQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch5#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'mzeDESgGMLayMTsMOcw0hQc3cuIvTnzfmk+Y5coaon4ReqOa486RncGqRzDxK508RPqq6a1L+aZehUdsDvWxYRIE5cUajTNnsc35WAT4TctNiJUDKHyn4R3Tl+VM+u89YrlagA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch5',
    connection_transport = 'edge-gateway',
    recorder_channel = 5,
    channel = 5,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 5 OR channel = 5);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch5',
    channel = 5,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 5;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 5 OR c.channel = 5)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 5 OR c.channel = 5);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', 'IquWlUdEatcAooSsmQp8HmkQwp1gNgtS52ssGnavczQeq4WJHrCwW161bthuxebQ+lN3cAhXXY7Mo++uVHtGGCvrlggl8P71XJgo9nPO+thn8DFsr8KSH6SX3F1wGQoQUWSP3g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch6#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'dMGm52dUEKLSppeLaM1+0oM/6yMePWxjwaWBtrDRP2PY3i8GPpimgqZfhS9EhU6D+cQQLkXyhTmm/tvTpNOrLl9BMQQmOzrJcaSukl35MqGW5O5cqwR/rr5Fkzl3BCqGzBFXiA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch6#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'rTGWETr/0cAp9LWGz4jhslijom8kOJz5xd+OAhPIhBYtV1mvfzc/iSro/c7XJaOH4l/MXqZ3OeC4pVFsg16oLRiSdSJhM8w5eXkgiA8l6Y/1Hv7S3NglbO8dgvX7GnF8mLEUDg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch6',
    connection_transport = 'edge-gateway',
    recorder_channel = 6,
    channel = 6,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 6 OR channel = 6);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch6',
    channel = 6,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 6;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 6 OR c.channel = 6)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 6 OR c.channel = 6);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', 'sUXNUbql1FGKCQeeuzJimrtVDeBsW3kANEhlUkxqTgWx6CIhhbJv2vqGNs0xHwosgiOEpoWapVpStSH/z1F5i3ULcDfgquou98SMRvDbvwpTlMcGmhwsp0mFLTm5EdvZ/5a6Ew==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch7#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'behK2zRZ7JYej3kmAqMPg5tdkaKX7aoiK3VtzDZ3OTYhOeDw9VfbRDWi/A19p5l7ohHQfPvjuQONwF1R+6mH8jhqRMjikcIjP8oAUoaU6OdJHeadLSL98EProUXnNFSCBt0ilg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch7#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'OsT4+QsGMfI8PaYPTqkKw94+dEOwVJVpOZcPszyFlz/K4keXM6vdzU4xrvl6hn3p4aRsuxrWazJocTgI1ltT3hnCWD8Z+1dL6/OAJ0dUlH/BZpE2wFHFDQCJXAhbDdOeORaSEg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch7',
    connection_transport = 'edge-gateway',
    recorder_channel = 7,
    channel = 7,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 7 OR channel = 7);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch7',
    channel = 7,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 7;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 7 OR c.channel = 7)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 7 OR c.channel = 7);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', 'O1xy+q0j/nTCfGyY0D1UHD30thHb2eIrZ+Kj9L8eWg9poxRxAECSOBwC3ww5B474x3pc6Nq71ONd+IDIedyE2zohWs+gFNoO+eY/rSXQfSjdwm5dJN2/0ONNNg4X3PA3biwuQw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch8#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'pXJCIoeHUx7XEJ8FP0oPAQiGhvgh8RenOYmiHFuVUzDIuyHEQrUNOOVnsbm0SJaZ8cL69e4H3XXWt1L7AHpNbDM3abhjqv7Di7/MzX3D4og0SRFfje+FP2uDxm3AwFlFv+E12w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch8#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '7luFqveEXUQ7jUNI1tI98FKbPDClfGFoE74uklDXsUZap7pdtC9hiMAVgXg/oTnNpToDR+oy1Y6ZAgu3TNiYNcYu8BGdV7n37QScD4tDIrucHyTsh9MX1X6HVuJDJ/msM6FBfA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch8',
    connection_transport = 'edge-gateway',
    recorder_channel = 8,
    channel = 8,
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (recorder_channel = 8 OR channel = 8);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/hajipur-ch8',
    channel = 8,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 8;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 8 OR c.channel = 8)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (c.recorder_channel = 8 OR c.channel = 8);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', '3IlMASxP9yexKtoO7j7ksbEpQykAurVjMe7akC6lWlz1UbI4kz7AoDrcvsBHnzDWrckI4FJiws+h7QLnBwMY3Y9hubdefb83t1H/ojxAfaSEvARQ5KMRatcBPqJ0s9U8SQ3JkQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'AMkoMT0XIIel9T2ADJQKcjp2iFyKei4yO6nKyXhL2/hgyL+VINxIfJeLCQ1D2j/kzMYddQkn95iqB1w761n2s8PjS2Bgio78vO1dQ0pf2gljKWersu6gfNrnlvb4EqqCZo9WsA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'UB/3xyxtg3SII6/PVh4TTeDNyNep4KOnlCBIFhqRz/RnFSRNnr9SIIAp7gLLfZROcsfU8hJEEuJcMPcCBaTt8rHMT1OUko0A29tdraG8eDmLlM7avgEzGdibiXnAigkVX8Kd/A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1',
    connection_transport = 'edge-gateway',
    recorder_channel = 1,
    channel = 1,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 1 OR channel = 1);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1',
    channel = 1,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 1;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 1 OR c.channel = 1)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 1 OR c.channel = 1);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', 'OHRR7VG7Eb8duEIhxDeoPSQNbTs7RuV3bqtfhcxluGgBt0L5uUX9pZctaEVy8ZKigMp9dxocdIy8kncCYHMPg+M+mFHzXnOKBSezMrd3yEXHlG1GXrpQlfqt+kHrp51Z2OAuCg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'v1I/pLqGRjacS99diwlbqSF5D2QxMkEby7y7kYrRAJlpbItOoz/mkPJZlQfJxBIzJoskZRy3qJavrDE0z+wCOu7io1/492GYguvS3Efqm0twLbvRV8z6Qg/fyaVxY7sGgURvsQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'k/qXZaLKWwwes8zeU0rFvvzhO4bk5pTz2TxYT0FAmR6yi4YBwKT0oPc27VIlRIThzdcNGKosabP709zqm1UMqw4xpwq5KId2neEAwyJPVuSX+OCwAsRTMvTrhX7VQl4TUpGFFw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2',
    connection_transport = 'edge-gateway',
    recorder_channel = 2,
    channel = 2,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 2 OR channel = 2);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2',
    channel = 2,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 2;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 2 OR c.channel = 2)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 2 OR c.channel = 2);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', 'MTKaHPblP8ksgs7IeuE+qg+pF3mfGU48L5xQMpV7ypRCfbddfeh4P3OjQbwOlewsnUh1HtNe7j4wtncqppHiE9IO0eynojb60YnKAFacocbQ7BEPw0M88gDWqUw/DLL4ELQ0ng==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'XWoO8DtoAegEsfvU+10U0teo1eg0CIthiICb5j1vDZ5lTcQVWUZT1W2qjVIrJceqotDEfwvcyCEY31tNrF9kLVchan/p2JW5TbuIUZ2qmp5JGmYVxOWoMqLlYqDzjkQR9/i9jA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'f4MwdLEEzBWlbGIdl3bzbxxj9JmUbWSH2uJZpzhSrnHqSWn70J8/7dPUnb3QxhYWvmJu3rr34ogGeZJV0POr0e6y6NvOQCIaDSXMLd3iH2p8TtDUMugZtJq8dAUhPqjUeTyP5Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3',
    connection_transport = 'edge-gateway',
    recorder_channel = 3,
    channel = 3,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 3 OR channel = 3);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3',
    channel = 3,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 3;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 3 OR c.channel = 3)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 3 OR c.channel = 3);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', 'NSA5CepbJMxtuxEoTGcovqdgVHhz7GeC+H0TNA7Lf2RYrBhFT9y7qRXxCTpxUX6GrxXajmy/c5KUIGcNS7XOrtzLtY9ijXvbR39seTiYVNLFKMO+OxzW8hgZxLoDROCpg++l8g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', '0/rbzNiPjYnSwoOwOwAjmFyC++QoLIUmiTnynPG2wGbmB5lnsMoe8z+e4gkx1cMXbGr0H2a+uFeyAbsqnceWPciLAEFzftWtCJJ8a0IkluedqEahYcq/eVi1ZsLNSo6X9HJLKA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '8CgBxthhZJs7Af2pl33lhh/nCrUISvS3zbFVCD1h/N2eglgZSxbaf+9mJL2iDdSdE9h63qKl3S7NCOILk/YdwJFFcYzm5dZT87DK5NlBIh3RbkcXhr2Ss/JPX7wpL6g6o1J4aQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4',
    connection_transport = 'edge-gateway',
    recorder_channel = 4,
    channel = 4,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 4 OR channel = 4);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4',
    channel = 4,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 4;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 4 OR c.channel = 4)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 4 OR c.channel = 4);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', 'L23xffv7ipLqGk5ib8aMMvnmTBWhtDiu8p21IVVkJCnSoZjEsjr0mdf/aCiria6ZBj9KyksfkEGB518l/Lp5H9Jjpt8SKbBiDk3tOBSL6wdrx4FRmDUMjuSKFFfr9TCMztd+dg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', '/J6CNVJWMNaW2BnAj/bJmisF69fPBk4oVMNlgs0+/wDPMKArU2+LiTitT88C27Wt6GGf3G8UdHxmO5irmv2ZRXdehC7TM/Z2zSANrzl19SCn4gEAYmgdtvr8t83Fe3/CHezlsA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '6vdTqGlVJxf3Kgs0J5xZbBEKj9ex5WSSx2hMlaAuU0uAdB1qPdrF8Mx0HvQxkLFWzfibMqONGbZJic3YqkQL1p9uVjbAMJvxr45ZzNR+up+U8dC8//yG1UaSOWqZ3hsCFoVWiA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5',
    connection_transport = 'edge-gateway',
    recorder_channel = 5,
    channel = 5,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 5 OR channel = 5);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5',
    channel = 5,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 5;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 5 OR c.channel = 5)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 5 OR c.channel = 5);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', 'EJsxzRXSX1LQaDxB9c/wGtaw1fUv2cuklSh/VRGGMRDQo2Z6Yy16HepMSGJz38v1WNRVOMsJPT+Ot6KQGGKwg0/CC00BXJ3keL0KgLHt5ErLuhbF4upnllKwfVRL/N/9KTlOsg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'EzoozmpxWdJUcfOVUrKsZOY/14C9EwJIL5ErN5jctQHPR6nsExR/HqI6FBWbXpTiiFXlJmuGryqs84d0vqso5kPVVVDz6gJQy3SXBymSFdy8zePYv+yNHz6gMHJWHnOo9M9ZHw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'B96iN6/V5cSWZPgVjzOx3Kvs8GmAVslSeg82eM4AOB8aBoUtgtA9SRUo4A+AF14xmlUE7vWpHKuVP4grlnkzEDN3NRSgamMXdWJQM/xPmn0X7eH7SCbhZaMh2XigNWzffxsAtw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6',
    connection_transport = 'edge-gateway',
    recorder_channel = 6,
    channel = 6,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 6 OR channel = 6);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6',
    channel = 6,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 6;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 6 OR c.channel = 6)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 6 OR c.channel = 6);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', 'jWlvWOkqdqFV9kjAUOpKtpJiHhPTifZLTKUVsnux6MY3DcomzQEltArJH9vnQWE6h5AGTj8YzOl2LvSGkds+FAtpU9pdeoSKR55TTsvTBiokY8VD9fn3ftIp5mPsQVJ1S6HVCw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'pzPUB4Wdb9zzQfRxIaAYlxN0zi1DRSXvdXYakNWP2IGHtB4tLmfA6e4k4KhJEvhpQigkC8RktMad9Nx9ybdpcxQItzPgH31bXmkrpI+fzrjmH047ol2ko+kkzrUX2d8tLo2r0Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'hxxeulxBvGYEMj56Qe24ZdoNGZ76EnYHejFtj9k/x40yBiDvRZKUhq8m5h9gNLwpT4TlxIDEaGf5IJux9XjSoLUE+K8sXaKWFswW7eBX47buvoBEsgAl9XQT0MiEV3w38QqTaw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7',
    connection_transport = 'edge-gateway',
    recorder_channel = 7,
    channel = 7,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 7 OR channel = 7);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7',
    channel = 7,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 7;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 7 OR c.channel = 7)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 7 OR c.channel = 7);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', 'npma6suVV9UJQ0mCT+ydzhseAThwXN9eYaf1Tx9qgRv9YqnD6i7OdIKL33sWeCaQdD28+JHuj1cAq+rP/mxrfI2+Yh4Cb28AqHa4YhAE+QPdLczjaIoWyUGJffINyG+Czqn+9Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'pMbMJFD1pAFDT0yyygpzOuidUY5/JPdlFACHhhvMEnkqcii+XXDETuwtF6DUbIHpmT6BIRW9kL8XBD8vUeVvDMiVRPNP+apuTYdLkqJxTgOLKVF4hNaxrOp5FSmXI4nYTR5kgg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'FguxPEZHLLbqFgxtIz2I313Pu73fZA9ll7+u2CRFRn/7V2NYKIVS+0Y8iGG87tf14Tq1Fqnc2RNMVwJlsjIWSPVpSybf7Sw00+RVrQWpVroO0MJpMxjpTD0N7nIoDFPiRJ8gZg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8',
    connection_transport = 'edge-gateway',
    recorder_channel = 8,
    channel = 8,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (recorder_channel = 8 OR channel = 8);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8',
    channel = 8,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 8;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 8 OR c.channel = 8)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND (c.recorder_channel = 8 OR c.channel = 8);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', 'aRXi5awRUL+HaE3/y34PduXHYd3iYsVBsfl0WnFg+IcgymqWVlckPfdKriZG6mlPF9zocxz0EaiCPezbFCY/Hd4MEwVDNjfdcd/8XHYBlG0spNkYXGStMBAq/lOmTHb9q4Z7HQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', '8OMWmfGrOBXibMxm9XYoo3H0cuuT9ecxQToA7wu9AiVeFeixlXau7ZRde8oC4K1UaWEc4KnUA7SV7e8D6xoUS0m7GPkRd4M4VBtk5oIXPC6aYybXCFlH2ZY65GdH/fVSxTGl6g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'DZn40X4ZJMuaqru6CxWbN/JtIOQF8LMdziiKIEQsbAfug7iiZYe/97lRn7eaW3+cf0dwVwJnnCMl03EmUt3tcZ0mm7E3m2yveArW9iRImkHoG3P/5WanxkL0lQe1iYeo7HQ2PQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1',
    connection_transport = 'edge-gateway',
    recorder_channel = 1,
    channel = 1,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 1 OR channel = 1);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1',
    channel = 1,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 1;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 1 OR c.channel = 1)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 1 OR c.channel = 1);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', 'frj5D4AeCyxk7AOCz46Vx9tqv31kdZeKfAPO3UL1MwXUdUuTrbM9DqyNwDgF6v91RmoU7vq+TVW28ijmRklFmgSds2b+ve6xTdpDoATaK8KgNX+PU+TJyj2X9zT6ExFV8HOfDQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'yxawW5teThKUltSm/wSoPu0EXPVe6kKnluVruqjJ1ww2l5teLHEEI/uNmI1x70X39uEaNiBdJYheOLLcUZH7s/nouK40ZNqTAMtHObCtbe2bHoPzsDmiayeE2inmRTEAb7uHdw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'ZTuiXZ00Zs0/v9WAoGMS+b0TLsgdpK+4Hmvg/3bsE8MaaNBOKNxI+ivDEgluci7/rNWKLwXRggNtgY5TRG92xV+LZ8JQF5orBRSlJ92tN9sLR6t928ZF1R+ZAV15m2Fb0Yhp8g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2',
    connection_transport = 'edge-gateway',
    recorder_channel = 2,
    channel = 2,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 2 OR channel = 2);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2',
    channel = 2,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 2;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 2 OR c.channel = 2)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 2 OR c.channel = 2);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', 'e/z13XRYLIZZutWwzJInnex74JkUbGHOyO3mB+5FF8mQrMok+8JhvHPQGHTWr0X5oTMy0yikiJ4V8/ckNlHjoGZxwGGG7bv2hxzalVypqX05Q775UrLTgPmCTregDeVigzminQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'WuoxBdThxvhxQZEnkYApPOldzssgAY3jPSbOxZew+IS2YZYQ/beebzQi9YdbmpSZOumQA/fsVQtEuU8Je9IXPBuuToJ1CXsn0mfHswSDudd+QMtTbIOP50q9aefLYKBKO9UW2A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'TRkhH+XuSZ+H18vzNDJ6u23BQzTDAuuThidmepuK0vh/ZBbqSn3LlsoK3L7KIel0qwSAB27GFRZRXg2gdJzjm9MqiqlFtfXZJ+x3qlR2PKWR/aeLQLJB9puf8LNhYOQgslHt9Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3',
    connection_transport = 'edge-gateway',
    recorder_channel = 3,
    channel = 3,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 3 OR channel = 3);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3',
    channel = 3,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 3;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 3 OR c.channel = 3)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 3 OR c.channel = 3);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', 'm3pPrWo42jUsr/ntIjfOdnSsk+nz7aubwike3XTXUFyaOhWa2rE3N/1Er21RLacVWmhyGTasPWtZN/0smHqcfd7mriQUSXEUpZnrQ1G02I0vkacC/U/B8u7QrSYeUs8NSuUuug==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'ZQpG69aMlmud9Jgit+cSsCf0kIK5s36UP/xCZ5AwTYt957AbswsFIKKEHspiL2MzGkLc2Joiw1dRCesWvKTRS5CZ6zYu9lBWFvPfLzCdn6tGB94fLIXaocNDcPJQBx8z9MQHOA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'DYdj33q7xlyp55nFDuptFVAPAoQSHOngIbNyUKoSArHmrWnpsHY0KF6kbgk8MTHQQrhS1Lnr70wPbdLTnhUi2p31d89lNq+U2QRA827X5eE1Hm7NLkZ26lEZV9+J6m8Be2J8OQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4',
    connection_transport = 'edge-gateway',
    recorder_channel = 4,
    channel = 4,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 4 OR channel = 4);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4',
    channel = 4,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 4;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 4 OR c.channel = 4)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 4 OR c.channel = 4);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', 'k/oVXWB4ZEvmDgNIqcNjS1D2bYvWlMy5lT6QiPLiXNLtN0kAviavIJl1dZmIO+ULoA2diLDTQlU7NQCr86xPSmoax7KqBGZTmF5qLJ++OHUGqnwl4fI1p2MTdAiou0va/TI9uQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', '+9rkm1Q6EaePqGRveDoLVADHZ/MBwKo00rjNCZd0EWZcEHfijDlyRO+WZEfxmylBBc1x2+s1CY6KildYYrVbwrEsHnLcpj2F8pJevJ/Of9MWfN9LPFU/7GhfKfHNzo0ZoDaSWw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '4vAv9TETVAMJI7WwHGs5od9Ut5B3HjgiIpbwB9hDUiKEKW1zMilaT2gjswtRdoDpyl+CX1wsNg4vnocJbaoPPyMFwh7MlhkUpHrGI8n9VSWYIjYVE2fupdJuiBfyoaMoQ+Mg+A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5',
    connection_transport = 'edge-gateway',
    recorder_channel = 5,
    channel = 5,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 5 OR channel = 5);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5',
    channel = 5,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 5;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 5 OR c.channel = 5)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 5 OR c.channel = 5);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', 'RZ/rQhoLiE+pUmcA2vJMl69Jds7ZNpDUDeQhWqWgFRglFfkn/DVlSlB3G1o8Oup9SuWzKG/ky+PnWgDLJYHPcLzzeD81qKMLA9e5k0SRokVAt9Tp/CPi3gxnsgWXuogK4IILWw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Brl9QxRgkBy5udvQMp//H1L1VfMxtsf011bQMKZXlwXrsHu0CZN2zC13tvUTr4XEpAz0SwxkAWxBvIDEbo7ky7a0LVAq5qaemzeXdr8uY4VUREMI8qjoExa5mwBJ2KX+HOCMIw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '8L1ysOI34k0YVYRy/r4MPZSHO3R6xXY/loGQ4e1aFo3Pc4PQFwXQC/L5s4c4x4jFYCiL7jCfQ0hIfCN0mMQrHvxS28uHWwPQYt0xLwdPw/MFm+VwKAAfVHTJBOCVuZBRUigV1Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6',
    connection_transport = 'edge-gateway',
    recorder_channel = 6,
    channel = 6,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 6 OR channel = 6);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6',
    channel = 6,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 6;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 6 OR c.channel = 6)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 6 OR c.channel = 6);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', '3r7w7pKHUgJXS20GsYLqlSs51bzfhiSLTkOWuiFmaFp1f7b0r4t4ZH4VV7a5NmtY85rgas3jU28oCJoNCfrTZTwpmBgJrsK5x+Zu4FTW6oVyFPEgbOuPFFGu2CWvrO7WFg/ktA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'imsAzwW3Eu34rvcuPxkHQPxYe0GrOhVarglgwRpkSasJMJyWfFuid46dOMf+vySvkRNrPUlyt7uBYoljl0X/V9cA+sLEEfwAjNJX8UcwGy/8lyVDoovNlD3Amyzdmw11lQUxFw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'cfRJQrK7C+zcrcLJThz+M37GNi1cWh88KzbT5FWsNjnyV4eftwDPDCu7SASueBxl7Zif/mI3E0xl0k8z+Celr+KFmS3ZfyoF9qVdt6HYZGpWIuchMN/XiX+7ATmZVMU5cQM15g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7',
    connection_transport = 'edge-gateway',
    recorder_channel = 7,
    channel = 7,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 7 OR channel = 7);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7',
    channel = 7,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 7;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 7 OR c.channel = 7)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 7 OR c.channel = 7);


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', 'wgtS+x9FTdjTmd96DQoW3kidVvfpOiPGCxpbYUrR1RkGk6uORMsCYJevts0+aP9q7DvP4qQ6Cnehk4pOYaUeWBzwyVrXw8g4Nz/sQaLtYGZL/YMI22lJGVB/EMz+gSdSLsyrhA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'nh6+Mw+okQKFAYXR/8UkpuxbLrjv2Q+Jsvi9OJUcdbsUJO4tOmrDmqiciUnGJjHfcW0XZ1cm24mummdcNW7Dw2uUEKlCtpXrWo0IeuzcRjCFIBexHbTFKpI5skHes1igWB4QVg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'uj5izJESo1ySx0+eIiOk5Pn9rcUQHDotijj/Dlj6GrjgwY4IbUwlei96qdDrdnUSYYmT/e0Lby8FTgNIkev/+fWdC7MslJEuPm0js56QyknprKJFwn2lqTPzLLGtB/+ZwXFFqA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8',
    connection_transport = 'edge-gateway',
    recorder_channel = 8,
    channel = 8,
    last_seen_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (recorder_channel = 8 OR channel = 8);


UPDATE device_identities
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8',
    channel = 8,
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND channel = 8;


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':health-online',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 8 OR c.channel = 8)
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    metrics = '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb,
    reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now();


INSERT INTO operational_health_telemetry (
  id, tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', c.id::text,
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:' || c.id::text || ':' || extract(epoch from now())::text,
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
FROM cameras c
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND (c.recorder_channel = 8 OR c.channel = 8);

COMMIT;