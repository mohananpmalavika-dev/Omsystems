BEGIN;

-- Activate and standard-name resource nodes for channels 1 to 8
UPDATE resource_nodes SET is_active = true, name = 'CP PLUS DVR - Channel 1 (192.168.1.45)' WHERE id = 'b2166797-9d88-4ab0-86da-2176c7ac0c13';
UPDATE resource_nodes SET is_active = true, name = 'CP PLUS DVR - Channel 2 (192.168.1.45)' WHERE id = '7a15f75b-5aa8-4225-a8a2-8e7da0ffa8df';
UPDATE resource_nodes SET is_active = true, name = 'CP PLUS DVR - Channel 3 (192.168.1.45)' WHERE id = '964dd276-1b0c-4003-a0a5-a0c4d51890c7';
UPDATE resource_nodes SET is_active = true, name = 'CP PLUS DVR - Channel 4 (192.168.1.45)' WHERE id = '4cc8de65-8dc7-41e7-870d-88fb8c67fb75';
UPDATE resource_nodes SET is_active = true, name = 'CP PLUS DVR - Channel 5 (192.168.1.45)' WHERE id = 'c0d0f55e-1254-4076-b414-b2123e683d14';
UPDATE resource_nodes SET is_active = true, name = 'CP PLUS DVR - Channel 6 (192.168.1.45)' WHERE id = '887e716a-2a1f-425f-a1ba-c482d99c3621';
UPDATE resource_nodes SET is_active = true, name = 'CP PLUS DVR - Channel 7 (192.168.1.45)' WHERE id = 'dd415479-6fe2-49ed-9673-056741637411';
UPDATE resource_nodes SET is_active = true, name = 'CP PLUS DVR - Channel 8 (192.168.1.45)' WHERE id = 'bce9915c-dd92-43a4-88eb-a164c6fd3860';

-- Insert channels 1 through 7 into cameras
INSERT INTO cameras (
  id, resource_node_id, branch_node_id, vendor, model, channel, protocol, status,
  connection_secret_ref, profiles, capabilities, ip_address, source_type,
  recorder_id, recorder_channel, connection_transport, device_identity_id,
  edge_agent_id, recorder_serial_number, first_seen_at, last_seen_at, identity_last_seen_at
) VALUES
  (
    gen_random_uuid(), 'b2166797-9d88-4ab0-86da-2176c7ac0c13', '525198ad-504d-48af-ac6c-dca057d38ed5',
    'cp-plus', 'Generic ONVIF / RTSP camera', 1, 'onvif-t', 'online',
    'edge://2e0c184b-6fe6-49e6-ad6b-4586e152f8b2/DVR-ch1',
    '[{"name": "sub", "role": "sub", "codec": "H264", "width": 640, "height": 360, "frameRate": 5, "bitrateKbps": 256, "preferredFor": ["live", "analytics"]}]'::jsonb,
    '{"ptz": false, "audio": false, "events": true}'::jsonb,
    '192.168.1.45', 'analog-dvr-channel', 'DVR', 1, 'edge-gateway', '607bbaf5-babb-442c-b8ab-8325ce4b7693',
    '2e0c184b-6fe6-49e6-ad6b-4586e152f8b2', '9FLX3NYS4X3UQ4HA', now(), now(), now()
  ),
  (
    gen_random_uuid(), '7a15f75b-5aa8-4225-a8a2-8e7da0ffa8df', '525198ad-504d-48af-ac6c-dca057d38ed5',
    'cp-plus', 'Generic ONVIF / RTSP camera', 2, 'onvif-t', 'online',
    'edge://2e0c184b-6fe6-49e6-ad6b-4586e152f8b2/DVR-ch2',
    '[{"name": "sub", "role": "sub", "codec": "H264", "width": 640, "height": 360, "frameRate": 5, "bitrateKbps": 256, "preferredFor": ["live", "analytics"]}]'::jsonb,
    '{"ptz": false, "audio": false, "events": true}'::jsonb,
    '192.168.1.45', 'analog-dvr-channel', 'DVR', 2, 'edge-gateway', '56e5d5dc-bcea-4b1a-a7ce-b584fdd0b50d',
    '2e0c184b-6fe6-49e6-ad6b-4586e152f8b2', '9FLX3NYS4X3UQ4HA', now(), now(), now()
  ),
  (
    gen_random_uuid(), '964dd276-1b0c-4003-a0a5-a0c4d51890c7', '525198ad-504d-48af-ac6c-dca057d38ed5',
    'cp-plus', 'Generic ONVIF / RTSP camera', 3, 'onvif-t', 'online',
    'edge://2e0c184b-6fe6-49e6-ad6b-4586e152f8b2/DVR-ch3',
    '[{"name": "sub", "role": "sub", "codec": "H264", "width": 640, "height": 360, "frameRate": 5, "bitrateKbps": 256, "preferredFor": ["live", "analytics"]}]'::jsonb,
    '{"ptz": false, "audio": false, "events": true}'::jsonb,
    '192.168.1.45', 'analog-dvr-channel', 'DVR', 3, 'edge-gateway', '4743b7fa-4d54-4b95-b3ca-713722e98b79',
    '2e0c184b-6fe6-49e6-ad6b-4586e152f8b2', '9FLX3NYS4X3UQ4HA', now(), now(), now()
  ),
  (
    gen_random_uuid(), '4cc8de65-8dc7-41e7-870d-88fb8c67fb75', '525198ad-504d-48af-ac6c-dca057d38ed5',
    'cp-plus', 'Generic ONVIF / RTSP camera', 4, 'onvif-t', 'online',
    'edge://2e0c184b-6fe6-49e6-ad6b-4586e152f8b2/DVR-ch4',
    '[{"name": "sub", "role": "sub", "codec": "H264", "width": 640, "height": 360, "frameRate": 5, "bitrateKbps": 256, "preferredFor": ["live", "analytics"]}]'::jsonb,
    '{"ptz": false, "audio": false, "events": true}'::jsonb,
    '192.168.1.45', 'analog-dvr-channel', 'DVR', 4, 'edge-gateway', '74ef3b31-0579-4593-8a96-2594f2fc3a41',
    '2e0c184b-6fe6-49e6-ad6b-4586e152f8b2', '9FLX3NYS4X3UQ4HA', now(), now(), now()
  ),
  (
    gen_random_uuid(), 'c0d0f55e-1254-4076-b414-b2123e683d14', '525198ad-504d-48af-ac6c-dca057d38ed5',
    'cp-plus', 'Generic ONVIF / RTSP camera', 5, 'onvif-t', 'online',
    'edge://2e0c184b-6fe6-49e6-ad6b-4586e152f8b2/DVR-ch5',
    '[{"name": "sub", "role": "sub", "codec": "H264", "width": 640, "height": 360, "frameRate": 5, "bitrateKbps": 256, "preferredFor": ["live", "analytics"]}]'::jsonb,
    '{"ptz": false, "audio": false, "events": true}'::jsonb,
    '192.168.1.45', 'analog-dvr-channel', 'DVR', 5, 'edge-gateway', '99c2d19f-dbea-43b2-91b5-fb155605cd70',
    '2e0c184b-6fe6-49e6-ad6b-4586e152f8b2', '9FLX3NYS4X3UQ4HA', now(), now(), now()
  ),
  (
    gen_random_uuid(), '887e716a-2a1f-425f-a1ba-c482d99c3621', '525198ad-504d-48af-ac6c-dca057d38ed5',
    'cp-plus', 'Generic ONVIF / RTSP camera', 6, 'onvif-t', 'online',
    'edge://2e0c184b-6fe6-49e6-ad6b-4586e152f8b2/DVR-ch6',
    '[{"name": "sub", "role": "sub", "codec": "H264", "width": 640, "height": 360, "frameRate": 5, "bitrateKbps": 256, "preferredFor": ["live", "analytics"]}]'::jsonb,
    '{"ptz": false, "audio": false, "events": true}'::jsonb,
    '192.168.1.45', 'analog-dvr-channel', 'DVR', 6, 'edge-gateway', '11759f1e-45fc-450e-97ce-b5cc160ecfb3',
    '2e0c184b-6fe6-49e6-ad6b-4586e152f8b2', '9FLX3NYS4X3UQ4HA', now(), now(), now()
  ),
  (
    gen_random_uuid(), 'dd415479-6fe2-49ed-9673-056741637411', '525198ad-504d-48af-ac6c-dca057d38ed5',
    'cp-plus', 'Generic ONVIF / RTSP camera', 7, 'onvif-t', 'online',
    'edge://2e0c184b-6fe6-49e6-ad6b-4586e152f8b2/DVR-ch7',
    '[{"name": "sub", "role": "sub", "codec": "H264", "width": 640, "height": 360, "frameRate": 5, "bitrateKbps": 256, "preferredFor": ["live", "analytics"]}]'::jsonb,
    '{"ptz": false, "audio": false, "events": true}'::jsonb,
    '192.168.1.45', 'analog-dvr-channel', 'DVR', 7, 'edge-gateway', '01a73298-61e4-42bb-84e7-ca63de6dc6d0',
    '2e0c184b-6fe6-49e6-ad6b-4586e152f8b2', '9FLX3NYS4X3UQ4HA', now(), now(), now()
  );

-- Link camera_id in device_identities
UPDATE device_identities di
SET camera_id = c.id
FROM cameras c
WHERE di.id = c.device_identity_id
  AND c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5';

COMMIT;
