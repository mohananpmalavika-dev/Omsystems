BEGIN;

UPDATE edge_agents
SET version = '0.1.49',
    agent_version = '0.1.49',
    desired_agent_version = '0.1.49',
    status = 'online',
    last_seen_at = now()
WHERE id = '748eeb31-76f8-43e9-9121-4c1d99166e87';


INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('748eeb31-76f8-43e9-9121-4c1d99166e87', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '["172.29.91.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id,
    vpn_networks = EXCLUDED.vpn_networks;


-- Stream secrets for Channel 1
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'nUFGjLvO+WG/p2VdAsy4C5okKzLcAgR9ppW+SeuGH+sRZjm3xvedfdVfabBGK02YyHG+ZfG1+VSrPVRAC+j8IN9u8p1VdcwvJW43niUpAIq20lXIIzo65LCHJ+whldq0E3GBBQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'hUcea80y1zrlHbBan7kCb9R8MtsJg7mY4eaFXAtsFqCqw5FZrqOsi480LSlgh/lWsBsM3AG4IKEkbkxJrMxnLbpwT0/SPnl3qD18QPJmfhWrI0+h33F5XrYZZO3l8XMNtSWihA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'OkvamOBHfmeswutfiLXBhsvnLpWkmmyEekvjY00mwDsz559w7JtbU6G/iFfxmZl1sCv4vyRJFNxOXBYQX/13gLrdZezoY59fzVzIhTVC8oljzLfDbjUINpPJqev5NYLYa4u94w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

-- Update camera 1
UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    recorder_channel = 1,
    recorder_id = 'recorder-hajipur-172-29-91-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '574ec320-ad4a-4c40-9a6d-76fa7cf7d13c';

-- Update resource node
UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 1',
    is_active = true,
    updated_at = now()
WHERE id = '859d306e-59bf-4bce-a4ad-c3defc2b7aea';

-- Update device identity
UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (channel = 1 OR camera_id = '574ec320-ad4a-4c40-9a6d-76fa7cf7d13c');

-- Upsert operational health
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '574ec320-ad4a-4c40-9a6d-76fa7cf7d13c',
  now(), now(), 'rtsp', 'verified', 'hajipur-49-online-574ec320-ad4a-4c40-9a6d-76fa7cf7d13c',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


-- Stream secrets for Channel 2
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'FWITX7hAk8wNxMXtx0YokD8Nz2l1gvxsqjypArvbVIA+09mlVqFcBF4N0rETKY71+2+qn2orSgJ0+T8LwzjudaoZTsyR8prbEiMBxlMG56pbUpW9uyElP2u5PLc1Y/0Vgv4aXA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'N7xwDK3ujpgAmhFPtzes+YXJc2EHrBaUKTEXcDT5cgVZAtNerTsCKrJZcpUh7Y3GVATRPLvRv76ibkaqTtPTmG5MJ5l6xDl4I2NDE+RXVyR6nMzx5FSUvFJwYtUHfnxf4+1/GQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'eoeOY6xdddN61jVT71vaRYoc6X6YjhePbpMnqckKSjGvP6heYbrv7+fIkt2D9ij4y9sNXCkFK8dDom2OOiQ00WUlLhzsYh24+Qef2cQW5DEE+KxxFfBoXfwbkoqwchZJOwbClw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

-- Update camera 2
UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    recorder_channel = 2,
    recorder_id = 'recorder-hajipur-172-29-91-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '25175a3f-562e-4138-a827-91518096937e';

-- Update resource node
UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 2',
    is_active = true,
    updated_at = now()
WHERE id = '3d0ec139-ea38-44b4-a853-921cefe79df1';

-- Update device identity
UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (channel = 2 OR camera_id = '25175a3f-562e-4138-a827-91518096937e');

-- Upsert operational health
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '25175a3f-562e-4138-a827-91518096937e',
  now(), now(), 'rtsp', 'verified', 'hajipur-49-online-25175a3f-562e-4138-a827-91518096937e',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


-- Stream secrets for Channel 3
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'WKF1nd2uD+hTx9+buCj+UqJpg0hyp94MFZkqrYzEhrbCN24HdGhzl6OeE+OXA0DVsG5+KF3/3RlrL/TvY73I49RWrKM0AbbPuJQrtcd1D8QIidG/+sqJljVz2kuPcrDONd429w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '1OY86mbXOl1/Eua2WODuK2h4DXzMibh3OJ/lQe4hhTgIBPk/x6Xg050jHwDffC7YMazBRGiphMM/K2YqFUr3i579fz5jaR9JKwG4o5/UUvPbqQ6PaeDsiVHWRnYiI56BgNiR2g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'fdhIOnc9FnbCjD5RkSpkOQEYZh8LyZeFtns0O6pyfEWS6cjQctalVlyi5jr3tii8JpV0284xIoQVbOBlZ+vWKDG67JLfHAoGI241+X/u+IdorJsz6ptIcAf16ZUJju1jBW39ew==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

-- Update camera 3
UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    recorder_channel = 3,
    recorder_id = 'recorder-hajipur-172-29-91-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '5ffde9b3-924c-4622-aa74-b3c406567d7c';

-- Update resource node
UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 3',
    is_active = true,
    updated_at = now()
WHERE id = '4e14ae68-3a2c-4d8b-92b2-1a6ccef4e221';

-- Update device identity
UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (channel = 3 OR camera_id = '5ffde9b3-924c-4622-aa74-b3c406567d7c');

-- Upsert operational health
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '5ffde9b3-924c-4622-aa74-b3c406567d7c',
  now(), now(), 'rtsp', 'verified', 'hajipur-49-online-5ffde9b3-924c-4622-aa74-b3c406567d7c',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


-- Stream secrets for Channel 4
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'vyxLNATzU5H3gewuYWYsmL1m53VDN+GT6eQfAJLRzI5hPTnvLoL9uUEE38OcxSEA6triY48Fg4DDm7M/nVSllrCnW5UWraZzW7Fpwqz//DLPwJs8AAy8zhSkniIlLjKccfIB+A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'lLCD0CG8PhpMHRBuUJgcQ3k7gXlmJ+RazON5k0JqtBldXmzWMLKwU4XbuEEBOhbFsefG+rijxhkIBKJdlBCdghg486KlxP4AVjHsQzGGkiY538Y/L0DGcUBzkxoZjFAHNqtoXA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'DyomgX7/777qsuHstHG8rqarS4NWfqAYNuK+LLoa+qfX9TjFF8TMbCzvkkAzf8j4r+ARe24wpSLSGMJ4p57jOwHYEZpZ0heXEn+Y8cD4NHsKzJF+YopKlTcMmPv5kNVme0qbvQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

-- Update camera 4
UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    recorder_channel = 4,
    recorder_id = 'recorder-hajipur-172-29-91-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '80ce1672-d553-4e85-b2e4-3758bd744eb4';

-- Update resource node
UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 4',
    is_active = true,
    updated_at = now()
WHERE id = 'd1abf68d-7ec6-4fbe-a615-2427605c3ee3';

-- Update device identity
UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (channel = 4 OR camera_id = '80ce1672-d553-4e85-b2e4-3758bd744eb4');

-- Upsert operational health
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '80ce1672-d553-4e85-b2e4-3758bd744eb4',
  now(), now(), 'rtsp', 'verified', 'hajipur-49-online-80ce1672-d553-4e85-b2e4-3758bd744eb4',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


-- Stream secrets for Channel 5
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'CFc2VbxDBKcSeO7Gm/bLG93p4589wY1ushLB5YW3hRUoW+H4Jmpa1mHVd84NW+YxNoVmz50XvjzoLNnGd/XSISjiPAQ/wOF3wVbHEork7o03qVWYxTyjw2KUfyJlJriwCO0SxQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'rSrLJ6hoX3hMKoyyCOgXNyC6r0ffJWulCHCnbBV65LS6v9kUIXgRTYcM/Q+5bUpzjrZy4G4uSdHZdTsW9dFcxFfElmzsbOQA6aTo2yVOheq54bXuPmjZoBgaAyGfLEXTte102g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '5buaYcZoaDJ5W6j4hY3UsuD5iHDsS0COI1DRdoEQHVSYDo/wrCDjqLsC7fRJ7s0uzPmmXMTpQ2+5EQWhzp06vdh+CzPxLVQQG2twbkvGFKqQ2KwELwyivr9x8ahj+xVaFAOGcA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

-- Update camera 5
UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    recorder_channel = 5,
    recorder_id = 'recorder-hajipur-172-29-91-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '84ae9288-43d5-4721-9587-8b2d41d44c54';

-- Update resource node
UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 5',
    is_active = true,
    updated_at = now()
WHERE id = '1899a136-9f84-4ff7-9ccd-aeb4c2bf8a77';

-- Update device identity
UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (channel = 5 OR camera_id = '84ae9288-43d5-4721-9587-8b2d41d44c54');

-- Upsert operational health
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '84ae9288-43d5-4721-9587-8b2d41d44c54',
  now(), now(), 'rtsp', 'verified', 'hajipur-49-online-84ae9288-43d5-4721-9587-8b2d41d44c54',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


-- Stream secrets for Channel 6
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'uIBBl4pC55QGUDs+QwEVZf9GBEAEcESSiOnAChBQf015POLvtKC2CdzEIJvesUCLAf6YX02xl9boFojgKHRgyb/WZc8CgrwcEwdHiP1bGgznxaU7ErtV+nvGCVrUjIsdn7AbIw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Pl/NCytCi/426PB9XFQOAI5Z4vpCXvg2zxC9DeQLeXtJjGinN9c3/ww3aPYBOQ+LvO+TOpuqw9GyZmTUubPmFCboLWsB36jVs8r7TAvy/nSB1GJ8uH0mUtjuMI9RecwR/4G3Yw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '9NLd2QuJSPMRP9OelDhINDzh4n1Xu459n/ZyftwzNv06qQw3sPGe16eT4h6nEijrQ0+6mq2kyp/Dp72NHBLz5jV3ST4Lm+VRv19frAw7mc0fYgexhzFeh4jHBNRLt0LcibuExg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

-- Update camera 6
UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    recorder_channel = 6,
    recorder_id = 'recorder-hajipur-172-29-91-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '88137ebc-8df1-4995-824a-99bfce6c2225';

-- Update resource node
UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 6',
    is_active = true,
    updated_at = now()
WHERE id = 'cc6f46ac-6a4e-43b0-bec9-be0a08590c74';

-- Update device identity
UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (channel = 6 OR camera_id = '88137ebc-8df1-4995-824a-99bfce6c2225');

-- Upsert operational health
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '88137ebc-8df1-4995-824a-99bfce6c2225',
  now(), now(), 'rtsp', 'verified', 'hajipur-49-online-88137ebc-8df1-4995-824a-99bfce6c2225',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


-- Stream secrets for Channel 7
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7', '748eeb31-76f8-43e9-9121-4c1d99166e87', '8h4pakxrmBaCSaxMSD6JqXdJxRDYnpjOvjWcgrc4kZbzDMYCWsuQ6piRoU7CItuuaV3Pkaf/rMSZ3k1UdJz/iqbGV2Oxx2XcHdzK/1Qyt4/kHBUGVk1HocnSxqJLXYHSBIcxiA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'oOxwP04dLvWA12rsxIYoGdJzjqQfNuiJnMRtIxYnYeJXo7cYyy0hgUfxVyKY/uOAs71iYH+R/067Guse60D0DK3udbWht07lBmNYOMabOD9QDi8Q4reg2FIrc6sSrR2RtfEoXg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'YKXX8WkudarqQJtWEfSqvdbcPPlVph5cxbf7M8tl9vuTuzJHv9yqC8DrC3z+8hOsATaFT2noqWI7Xi44h9U7zw8dcuzwzsTQdPp6OY+T6xNOXz023Sk9uYMnmegHhRwCD1JsSg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

-- Update camera 7
UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    recorder_channel = 7,
    recorder_id = 'recorder-hajipur-172-29-91-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '8a2fa6b2-78d5-45ce-8f18-f3495ec3ca94';

-- Update resource node
UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 7',
    is_active = true,
    updated_at = now()
WHERE id = 'be7e8d77-5e45-480a-8001-b9b43bf29357';

-- Update device identity
UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (channel = 7 OR camera_id = '8a2fa6b2-78d5-45ce-8f18-f3495ec3ca94');

-- Upsert operational health
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '8a2fa6b2-78d5-45ce-8f18-f3495ec3ca94',
  now(), now(), 'rtsp', 'verified', 'hajipur-49-online-8a2fa6b2-78d5-45ce-8f18-f3495ec3ca94',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


-- Stream secrets for Channel 8
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'PpT1UDWSHrU4sVCyk2YBL6qvDqpDSMI5HDQtkk25ITWSlrKvF+mDhProBCWXUQSlLu+JwDGFhF2+t267fhfX0DHPRk/GqbJI48qArg2WJzyEKpfLZt6Zvzh0lp7UYUUAKrcbSw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'YbhRAROljBBI+Bepi58rtPP/CY6qg+OQhQVJVOqdutHrp0POHF+duNeJTV4EZe1GIYtRc+NFBwM6AN5ncDVxZ0VLwSmwBj2cXZRhL6MKIK0CdJDv0/kH1sH2ePl8BOAi0Apnnw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'zz+86df61hXtMfNo52GaJJuDlqe1t8fecPiUjzE5pWLZHoVi5SZ92WS/i9kSEX1Xp/mBjhGFMarKBY2ZZdyBUEIey74//OMiC7pDKLUxQF2lGt0O7QpEs+DfuhzftjqpIe72/Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

-- Update camera 8
UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    recorder_channel = 8,
    recorder_id = 'recorder-hajipur-172-29-91-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'aa6e8afc-07a6-4b05-b962-c4133f79e306';

-- Update resource node
UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 8',
    is_active = true,
    updated_at = now()
WHERE id = 'd6466b80-7066-4be2-8a58-d70180e241b7';

-- Update device identity
UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (channel = 8 OR camera_id = 'aa6e8afc-07a6-4b05-b962-c4133f79e306');

-- Upsert operational health
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'aa6e8afc-07a6-4b05-b962-c4133f79e306',
  now(), now(), 'rtsp', 'verified', 'hajipur-49-online-aa6e8afc-07a6-4b05-b962-c4133f79e306',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


-- Stream secrets for Channel 9
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch9', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'rNr2RYbL+9uFCYgnGsO8uOvtQuc/2P2qYsyR9M8narAN3HXI+DnKQHbtgNTfLlMDmZswIRx/Sxk8cqExnssH+eU6eIoyUWTiT0YkxMjHGKD2Ojjp3ExNfAoEidfQNtSayry7Vw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch9#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Tis4hjwhs9vuyBHHD/pTXik5SRH2c6b7ypMCSEdkCKyPVxtC+bnkNfOI1Kj7xH8IlShnmNGEaSDExE6jlqWnswafd30zAejXjT9wqVXRbsaNaCfSYM3YjXG4feKqNrKWOnDraw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch9#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'R7sI137I/IxdhmR27VBDO23U9oOfq4b0e6GGlAvqm89bvIOBWdgxzyOynW6WN4eV+8f9NH7iXlSgCm9wNLwXLn88rAMwKh/J4P1CtHQspDAh9Wl51lxnZyyRr8YLZ8KJKqdRRw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

-- Update camera 9
UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 9',
    channel = 9,
    recorder_channel = 9,
    recorder_id = 'recorder-hajipur-172-29-91-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch9',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '3c2101f3-4569-4083-8eef-e27670e26a14';

-- Update resource node
UPDATE resource_nodes
SET name = 'CP PLUS DVR - Channel 9',
    is_active = true,
    updated_at = now()
WHERE id = '46ac058a-177e-4d60-9515-65d567fbb663';

-- Update device identity
UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch9',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 9',
    channel = 9,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND (channel = 9 OR camera_id = '3c2101f3-4569-4083-8eef-e27670e26a14');

-- Upsert operational health
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '3c2101f3-4569-4083-8eef-e27670e26a14',
  now(), now(), 'rtsp', 'verified', 'hajipur-49-online-3c2101f3-4569-4083-8eef-e27670e26a14',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'recorder', 'recorder-hajipur-172-29-91-100',
  now(), now(), 'edge-probe', 'verified', 'hajipur-49-dvr-recorder',
  '{"status": "online", "pingOk": true, "responseTimeMs": 15}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];

COMMIT;