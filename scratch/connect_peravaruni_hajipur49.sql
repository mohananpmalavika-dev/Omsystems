BEGIN;

INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('748eeb31-76f8-43e9-9121-4c1d99166e87', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '["172.28.36.100/32", "172.28.18.100/32", "172.29.55.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch1', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'h9Aa1cIvUmx4AyG/s0UkEzI1nEwQrsuZuUl7K71WgH+5PxdeqJJljJx1Ls2zTWUzPVbcXcnIlRv7G270+lbxLcdPGD6zWCvmohJQnKkcGOoppd/3bfHMElwwK90+Tm85V0L+PQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch1#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'a+Q9W9naLnpjnPe5GPNjhPcXegtj1mRs0wIJ6xIorjMwULFHsrFH2rlvv//fh9zr366CBIl/103bbCTRoYgm9dboiAGtooelfgNH1laqpY5ye6SBu6aZwcmH20N77XXHnPDvTw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch1#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'myPCsvp7iJjLLjb3mrcmG8kTBI8D+UKmi1Cob77Owjb8G7Ds3vwkkpvLtX37sYT3V5Vp5c9laSe8CTsogdlZlBwbYnDXwsXuNeiELh+nE6QnXYhYmZFnGGi65w9mUxZ0x8Smrg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    recorder_channel = 1,
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch1',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch1',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 1;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '4d3caa3d-e03d-4689-81a6-a10e6f26329c',
  now(), now(), 'rtsp', 'verified', 'peravaruni-online-4d3caa3d-e03d-4689-81a6-a10e6f26329c',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch2', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'M7+ZzDPaBaIy87XyYZ3lYb0xGG3PI6cz8FCsZ2mlAw4XqY6paiW36VQFzNg/eON0tJ3NdV/UwbYtiPEyjV314dIGjvDTQa+v3VSlLlRaV8LLOzKEpTmKm45fYuPS/emGCg2XyA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch2#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '9ch3o6/3NdYLq+0jYdswxnszwq6JgxeXnxSf7rSjAzhAUjGbmA43ZhSzXd4mskKetrq0ims5oq/1LW+zjLub746GGXSU+RDcwzw4fRLKxdEzdwlH4Z0rrwdbiwUes0e20hR5Ng==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch2#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '0KAEunjHSIAW2ushe6PllRmcbbimCjZX/sJRgg9duT2L33yAlyJ/3PLlaTnijcKXf/lHfPWXX7rj65FMy3cQlfPJvaHg+qumKwiBRVGkDNxrB9KoBj83zlYS6wzBccguFfRonw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    recorder_channel = 2,
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch2',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch2',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 2;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'a66bbc0b-1d47-4462-9cf7-94b5b35824df',
  now(), now(), 'rtsp', 'verified', 'peravaruni-online-a66bbc0b-1d47-4462-9cf7-94b5b35824df',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch3', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'sLXsxkLAzInA/ghgMr0qd0sHZzRdEbyOPT96Fs3mJo21QmY5ovPtcY0NY9JA5IKhX+AOsX4tM4RMJVbximKn0FLVIEOsXt/TWwIZYCwcIauVU6TtRmcXZ8j5IJFzYowZFAG/IA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch3#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'EdbPGIIynK5H2KEsTlR/kQUFNLAs4Dd1gzY0PnQdRHpKMvDgYOhgntjX6Hz4z7ciNULcr9oZYBQ+U+5QY60xS1jJuMHops4rA5yBJ6nytgILnH9T4TWvqwq4kz3jMAb53DBJmA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch3#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '+oh/JS6HyC3pXl68lhO2MeR+eGaNPadL7NnDuc+cWtry9/X1fkbrEp1OEHpWsQFtiRQpbEc/8lDZ3wftONAFW5l+O9A5OmT3ikZSqxNt+Hjz1C0TsXGypW/0mTrGKIaMnof1vQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    recorder_channel = 3,
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch3',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch3',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 3;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '940fb6f4-7c41-4c92-b4f1-85a459ebb38d',
  now(), now(), 'rtsp', 'verified', 'peravaruni-online-940fb6f4-7c41-4c92-b4f1-85a459ebb38d',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch4', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'zCJPsCV3mV7hWvrYEJWE79JxxOPlShjUvwr3SSuXbiMoJjslzNIYasCOzMKvHTi1UlObtCCgTPi/r10cUYDNIUuSbiJMynllsXFZlW1OfcDHD/BzMbgyXHzzHbdY/QNZbEF1qw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch4#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'qiNxcBVfv+UnrkCJ7Co/9R4CeYPe8KD8nb5f4DlYEM3Ui3jEinDIKyfsgVu58eGqoyn1iNNUusTYU8O7A/qvjx5wujQ9UXO4Q28OrBiTTSGWKD8TVxLG+VwXGkixPi9WgxEGKA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch4#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'ZWK/F2oLRViHmjF3l19hsg90ssmjfqwltnlyWmC+iBqgkU9BqIEaaQnciQ96SXaukeLseHsdo+Ga3USPLHkI4V+vP8XiviwlsVlUT4nIfw9Xjz2wtM+edQBVN8SCYAmmduV42Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    recorder_channel = 4,
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch4',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch4',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 4;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '1fa8cd44-c782-40a3-81f2-a933fb2b1d76',
  now(), now(), 'rtsp', 'verified', 'peravaruni-online-1fa8cd44-c782-40a3-81f2-a933fb2b1d76',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'HiqQ77CJNYfXhnmAKk9DUYYBZmDGtia5zIX9lptf6d1ObZqfwMTvyxEhKzjpUeZeIeMUDNTa6m8HgR3cRlQ2VQbOPTJ//MPCSq6j4vOJyS15ZlsScSkRBVZuFEZXf6RhPjaIZQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch5#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'KPAz2hpn1gyz7EJy9vgxJ1ZXUfPZSQFwBjPHxKYEFe+n+T3vb27vrHHiXXkBmPw23s6nSpKB5x/Gk5PM30wymKowb0OaZkO7JfkODOCX3KnO4wcnlskgVLk5KLW0R6VWWdNeTg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch5#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'UZiUCZppkh/Y/JpbUTbrnjfAImT74BwHi80C2KeNLW0GudnM/8T1apbXCeFi1aa0BKm+qD6vjJ7HRTkmR+ISpjSgoVRsKpMr5DTV64Q6sU6g0GAHQrBj7cB5nzKlov2kHY6Ghg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    recorder_channel = 5,
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch5',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '9cf710ef-1a0b-444b-9c30-abbac95948fe';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch5',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 5;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '9cf710ef-1a0b-444b-9c30-abbac95948fe',
  now(), now(), 'rtsp', 'verified', 'peravaruni-online-9cf710ef-1a0b-444b-9c30-abbac95948fe',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch6', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'PANa/p4oYhI3B9MaWe23v98la8zAAb3KXMINI52Gbv+NYrastXN+Tlrn9T0exWcff6AGvzQzhDQB5h13fgziMQmvZDTt5lQ4cDc2M4Xc7asiDWHmITM5yP7UfklAe3d7N0cF+w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch6#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'fwJwjUKmPejIHS4w3tCF7vtMA8PW8Mdp0ja4p1OjapR4qwRlKyFbCz+vUMeqIU6SBsQoJbabxhM5AkMQdqiTpZ2INFKkpSeoW0RfB/EUBmdO5iHmzWDuz8rVwoCa83PLXeGcBw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch6#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'ntdjLBWS/C76Obau88IwA3HGUFfRp8EMZp5j5dfwHaRdNe5BShEBBPbYJhNXLvd6vuL2v56voe/kQw6wU5Zsv+36RRLtVYIwOoNfGgZ1FnV/7NQhb95FhM6dl2o9PLCXORwprg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    recorder_channel = 6,
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch6',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch6',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 6;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'fc1a1f29-8b1c-4743-a093-40584e1a96a8',
  now(), now(), 'rtsp', 'verified', 'peravaruni-online-fc1a1f29-8b1c-4743-a093-40584e1a96a8',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch7', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'LBDzCeglXew+3GG1wwoIXVnynfj3cDYo76kkk0Lz7ACyOlPYfMFoamIvqOVzoGUPj3WrUDExVIlekPE4f2VGjyiTkmw7AJzQXIlhn6kK7rG4a2dlfGqYjRfAMeD3KiJfaCfinw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch7#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'f1srI916gUwHGcekORGeuptVyoE11Oir3ojJUH2NspIzV+iczOAZBVI1Xaw9JQRrT5OztbTgn9q21eN5XMHIn2Q21tZ3KxDkN0Z6UNrPO8BFonchC+H3r+PSHmbKMayX1lD5Lw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch7#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Ofl/BmG31eZnqyWY8SNm39NvBIzHn/5pagG2diRhoNcMPYJXHvy+YJTKvJWlDqIBSRJYoQ5VRNsQb/M95+Ckkz4dBwQsHmQcq409i7kQGzW0bgEAk0DQGuq7GO+tvglzO2ycQw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    recorder_channel = 7,
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch7',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '3baa601f-67e0-4e0e-905d-0688df725bf1';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch7',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 7;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '3baa601f-67e0-4e0e-905d-0688df725bf1',
  now(), now(), 'rtsp', 'verified', 'peravaruni-online-3baa601f-67e0-4e0e-905d-0688df725bf1',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch8', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'n9CYf/Sg4SvPMUSI0lQzBSTkSxFYyM0ExH7NCT5aT5t03dLkaFLTOeWYnoVyp1EGMjRr9izmfzoMFQEjGMHm4C2P7uFhRWqDVoNooHf1B609RhtlAY3tDLhySD4+7KNmgjlpuQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch8#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'ebITLbq21lsubv9nHlFx5D9TOU1hlqtalggT1rgB1oXCXKm9yBb9ZwFMdX2pbivpW5pCY4rFILJDdgBAGdv6OcWBip4uu8bTND1tCGZw57RafGgwR87q5vtFUMZLIp8CuUGpgQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch8#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'WWQp1h558MBzMX9WuqbjHMTqhrWXG0LyjYfeF+7JkMu0SeuYQ1PfAMZ5B52uVM1VCftFdDSK+mKXama74XQx1DU3zypmdbLMTUL+tHdLNaM0HdPUM2TZrHfBEb+6TKiCfys8Uw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    recorder_channel = 8,
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch8',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '14d869da-4642-4d74-9de0-c4c6c2be4488';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch8',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND channel = 8;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '14d869da-4642-4d74-9de0-c4c6c2be4488',
  now(), now(), 'rtsp', 'verified', 'peravaruni-online-14d869da-4642-4d74-9de0-c4c6c2be4488',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch1',
    connection_transport = 'edge-gateway',
    last_seen_at = now()
WHERE id = '26c0477d-c9b3-4374-8ea8-641337d7e8c1';

COMMIT;