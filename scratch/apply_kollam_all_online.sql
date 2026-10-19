BEGIN;

INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('748eeb31-76f8-43e9-9121-4c1d99166e87', '525198ad-504d-48af-ac6c-dca057d38ed5', '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '["172.29.91.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch1', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'S5zePm70KN2xBiQ0C997935pTATdUC8NuUgbnyNo8EJhhTaI+ocMegVKa4HvdN+ZESNqOle7Gcq8w3ijdpWaDTYDIlhFPda3YLfhj8+nOpL8XDMEtIH+h/N2FbDrYmlad/pA3Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch1#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'qj+8+uG4AXR5XBeeJpEfuJNOiri2cf0Zz3eN/iDutmdb/X5mnU2eAAQ/AFON0lQC8+nryq+c6ccvTZhQTKD8SGB/rCvEFxc/JYHm0l1hHv0STregIUfchUwuAKNvyJTOwXKjJQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch1#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'JQSfubfPlE0t6ZmlUXvys0MO06Ocf2rw9Rur33ElTwx7zGBfx+CCFRDdVp9tup0oxZ46Gg/nJ9jpBcQt75yJisUAklfyqkRzUBFFwrTM4LDmwhOHy/I0GFhyUewn5uFNXiv6zg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


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
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch1',
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
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch1',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'c77af473-31e3-4193-834a-1110dc2d4a0c';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'b7a24b40-013d-40c9-bd46-823cbcf6e326',
  now(), now(), 'rtsp', 'verified', 'kollam-online-b7a24b40-013d-40c9-bd46-823cbcf6e326',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch2', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'tQqGtXts3Oc8gxQ/ZxUssVGMHekbYERyMlM5f8qoCjWbb+GdMtlSmTHovNoCwc0syeomcNatRTBT++QwEzIA+O8BV7fBYkhYHZF6su9ncWo46KKsipxB4BxjdiCRUqH0iO2bVA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch2#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'oMyV6+rxrfyXv8GDWeFt6p+P46KLobBVHLQJnWAByt3rvy0I0rUpd6FSa5tHjO6ZadEh6xsVbKVFtyOcoLw/vYuRa3nnXchU7FAC3EIoDH7ERBCevVZ3vjsBK+ewnsqwJxBcfA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch2#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Wksve0gEu0E1M1HQ+TJ4tk1aSx1+gjbOG2/PgMwpZJROJbgwGSjnsyypmdEovVpYCWLGJsEuQ/RJhvoq4HFp7/J78+kd8co/mltSIpiBvNOIFejsEDoVs3ANg6gnm7GDrsMx8w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


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
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch2',
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
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch2',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'dcbb3522-a0fa-418c-b77c-b91030a9cc93';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53',
  now(), now(), 'rtsp', 'verified', 'kollam-online-c7ef14ba-67eb-4d15-a173-9c56d51bbb53',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch3', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'T8hkwQ1tCLydox4AzRpVIstZQirAlKSVczv3E8797tVMQPIINWqvz9cMTJ+dfHPt/+ventjpAlbkloDh8HkvH7cYxCNfMawNS59OorKsoeN7FtTnQbjw65R1oGZADzvKuYuqYQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch3#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'JVr1nHS2DYuVWvLWGLfiMNS1aOQJ12bHalEex3ITytjrJOjG3ujAzwQ6ih8DhaHimTRL/rzPluhYFWKDeTQoRYykaL1yB2T95H8pU0U7tW0ErbaDAJ3YjWJUqOzSHi0j8c9ikg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch3#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'S1PKvByl7/icghbbDz/aTdsaXjb7zcLp/1iyQH64kRrBO3R56ZHDddiKN5wX4F1Bnuu3r6JTU4KBpi3Jm0qt8F+XodNsC0Nh5Gk9v/+tJ5yKqgF0F4GEttwspZZFQiaEwnS/yA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


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
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch3',
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
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch3',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '6933b508-1766-43c4-a395-014699fac166';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'da907692-01fd-4bf4-b305-f7259c05c887',
  now(), now(), 'rtsp', 'verified', 'kollam-online-da907692-01fd-4bf4-b305-f7259c05c887',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch4', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'wog8TU3bw2lCtiYzlEl7nv2yBMjmbmhXfVhsxqFCjbaDy5gfbAtMhOkeZCj9GwmyUFfORpadg/xcvdE5a6OxSi0o4DYaJGlbOJLeXAp1dapl/zT4ybc2myoPEc6Iys8mKHbv4Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch4#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'kjrIQXLckzRZ3IwKGaQvTILpHEv5PQnnsciQqQnMWZEvXIcDBGPmdemow5/I/t2kPKoIVVy6kITysXL29/yae+lIta4B78yrMEibVHtSC/lnbTrZIUCEQw6K96wV6XhUblp2LA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch4#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'kKFCOJk7mNlqFOeITPvVkOsO/u8zKxCnHfsHzSAvaj7CFR/jlCaxP0Ur9d+zpXVtgb6GMtpKhqmhm4gTv55diCAmYfygqIkeb8oL+MWRpppqaJzkupdQDZL1J2G267krM63zIA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


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
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch4',
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
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch4',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'd8e56908-1913-422d-9947-31a960096bc7';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '3da93c6e-6824-43dc-9bba-7332707d5856',
  now(), now(), 'rtsp', 'verified', 'kollam-online-3da93c6e-6824-43dc-9bba-7332707d5856',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'IsvC0/ZBeaC0RTkqQ7zugSvKp3xHt2D3ti8cfx6ip+hN7jpHgr8LkBF0v6w9boWHrq/8/sx1/YiBDqXYKR+5MFFft1RJPbswKFaHm/dSFpkxsHyOth8CPCl2sgVXIPoFHpNvRw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch5#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Xt+lUhP76maJgMwEhv7xamB5HJ5/KVWawmOkHpuFjSmU6tjQqnBlieZRgFs2sa0sOQe7rB58TPx912Ol+YsOx4pBeOAs1HiKyKk6G2BodZx+ExVBnqsjAXAiia1d5Jx5MIP5OA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch5#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '/lCQ2UhmTgCegHNXcnsXkyclS2afX2p7OQZwxEGBah4jQePUVNCtZp8xDZqnt0WSKh0AF4Sk2cxYJYbCykFJfTOlDK6MpDGVVwxd0dUXaRepQhKodmFPI/KakFZ+A2br3iVl9g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


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
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch5',
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
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch5',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'c8da8d72-34bb-4abc-8f5c-029615dfed11';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'cf27a4e8-23e4-4c4a-8e57-b49eef8302b2',
  now(), now(), 'rtsp', 'verified', 'kollam-online-cf27a4e8-23e4-4c4a-8e57-b49eef8302b2',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch6', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Fum7viKUQO/WSWTf1UpaD77hommdzIIjca3dtK+JUqnv5f6qCTpLrFX7c9tGt28+L5sVG5CsNJTd6GDRgCoojP/Nvi/pp3VSwhz3LAB+s92q6lFcpJVY0K9oudC5VRJcfP78fw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch6#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '7GXc/Uvg768yoiQJYm0LFb4R8VkHTqgtSO2TM7HHw3IA63QjCKu87Q39+NxBoy1SiCUKl0AJk08lkryziV/p8CVqKocKNg9KVUDaWgCt/yAUAFK3bfSM9AueqQHEFbb57d/oNg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch6#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'A2qI/Nl1Ve3EO/hm4MWlKTAQGEQ37EkGD/7Il5fNz/BXtpGF+dq6G/MmBdq+3F2S8aP4uvxmMnHKhPaOn2onN/9EfucAR1vrpVbbpHdlfGE2IFule4IJitzfIrznOp23JbC88Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


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
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch6',
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
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch6',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '7bf9d9c5-9140-4c96-9ea9-0fe2c460092a';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'c365a8e7-68a8-44bb-a63f-aae73dca7526',
  now(), now(), 'rtsp', 'verified', 'kollam-online-c365a8e7-68a8-44bb-a63f-aae73dca7526',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch7', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'yFpzJBALO7bMf5f2FY42I8HGayqBJzGUTV+ihuHwxsrl7kMGTRwJ8Fqd2ECRR3pNLPFfa+EnjxypmDFHO6bb6rAjMe+l+O+HLo+vmgYAGPHQjcgU5zS3V96kdNLb5e6VaKR38w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch7#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '1O9EO+stZ3+BkcewRzhr84YpV3MMJftV87rgmgbVS2wTAux9fi8Rk8k4ACFlKO7C0ja1lyRXLN7ytld2OOJIrxM7bxZD+ib/SpBzbwZdEYczvcp9pYksuRJG1nIK/DnrlFRnkw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch7#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'jX7VL3/9TzC1TsxWXr6xyD2qfE8H2TdGsxR+6Ev5QZDKOOc5QZPqFHqZzHwgmuWe6VHlQ8k+ogKeUQaRsX0b9hLXR5py03r1JMFClS5kLocEdVGU0KtgceQ/zmBTJ9JGtUejzQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


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
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch7',
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
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch7',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '82e3f62d-6317-4929-9b95-829ce27f4740';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '99455d3a-3411-43ad-b756-84a4ae17c026',
  now(), now(), 'rtsp', 'verified', 'kollam-online-99455d3a-3411-43ad-b756-84a4ae17c026',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch8', '748eeb31-76f8-43e9-9121-4c1d99166e87', '5PQTwVYs9Z2k/chTTCseg8wgSRxPAfKhWBIHPy2c8F2H2LRcEswbx4eXDOUgAFXhEaxLK7h/v2nlJR+uvHkVEqbezRuH+E/9A91fkQDJ5zitAjAzgx8yBjcyKBuJHFnSSmvjMQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch8#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'yUQBad9m5rYhQeKd/XwoCBKpoKd6HMAi/p2KSIKmk3LvsENDFOr8eKs549AIfTQ/SORXndSBc0p6cEvahK0OpyF9zFD+0i4CYi7PFqsqGaQ0vhdzw8A5XC0XyhS3TlyzqGpJ4A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch8#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '8O/YdTa/qHBtOCKjtfQBY832lQlEW5BarlAg9LDJQDlptzKY6BRuHsfe3goDXYZV1NPRP4+ndbaAJbXffI7oBFgamem9oulvie//TLatB576HG7iHAqZ4In+wVyWvpV4JO6Aew==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


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
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch8',
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
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/kollam-ch8',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '3838fa28-6e1e-44d2-a15c-47911f765265';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '525198ad-504d-48af-ac6c-dca057d38ed5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d',
  now(), now(), 'rtsp', 'verified', 'kollam-online-fb465a8f-5d79-4a3f-9cb8-b8cec471708d',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":350,"responseTimeMs":120,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = now(),
    received_at = now(),
    quality = 'verified',
    metrics = EXCLUDED.metrics,
    reason_codes = '{}'::text[];

COMMIT;