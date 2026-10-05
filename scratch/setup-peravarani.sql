BEGIN;

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', 'y/Lidp2EK1JTPRSwZvJwVC+NU4uMWlXqG70RMvRBHDbsykofNivAj5vyZ8W63OQNf3aGzmtzpqNZ7rHcf5mFSrI0IfFG6xLs5ELb490UDNoDxglizlsyF/IyOIs1DAWfrO9LMg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'L0AfMWoQQkP7KorpgDMqRvP0p5EQCoCT/m7C9jttmOd4ZojNm+46dZdASTiZzD+tsPoZA/L8Co4aA7GfDylD9+CxdePsQqpby+ZtsBsjy1RCHPD1iu9fEzlHTIOt07X27Pr6yw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'bGHy8i9n0v9RwkT0rVCYbMeIoq19eEZFHfc6kEB2EGAYEolr4+IFQZ9rWrkJ3/zqZfzFx2A2Y9dh8fSui30GzYw9EgvVqWpJ9GLCiF8J2QR002iwEKN+3kpuUXBJR9v3FbG5EA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE resource_nodes 
SET name = 'CP PLUS DVR - Channel 1', is_active = true, updated_at = now() 
WHERE id = '6db62dfc-99e5-4279-9926-1a1e6f722c05';


UPDATE device_identities 
SET credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1',
    edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '7865ebc4-90a7-4cf7-89f7-c56b29599eed';


UPDATE cameras 
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch1',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 1,
    last_seen_at = now()
WHERE id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', '4d3caa3d-e03d-4689-81a6-a10e6f26329c',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:4d3caa3d-e03d-4689-81a6-a10e6f26329c:init-online',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified', metrics = '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id, observed_at = now(), received_at = now();

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', '4d3caa3d-e03d-4689-81a6-a10e6f26329c',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:4d3caa3d-e03d-4689-81a6-a10e6f26329c:17912271119161',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', 'lFCF4TNaCHgvGHVYc0fHZpRWWewuqgFnfzEY/9H5kx72s4kphWHlQ7V1VdHk9StBGNkPO6z0SRHGqp3GGGKtSia5A8IGXfSD0fzt37tOrTcAlEhhG4JSkVz3guyMOWmlOaV0zg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'dxYPCwLaWU77gXigyo1OgEyC8062nFlzlk4u/0AeW1U6TbN5QZe5qj2wqfU8XqxBqhSgACGvGVI+EH0vz6GMH0w6vfvNFUVVPpbQigy91/60zdGPSQVxXjq2oQ2pxTNNbIxwlw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'sJaTsb2cfnr72YsXdJdnb49fmRezrhBvdPDWHwsz25S0PGppQyIk4XWvYMd1OTdAsOW/Tkcf9mpRqlnSD0G0RVZa++j/9GGvWNe3NZPYrvyHUBgdXQa7y0YMVzfKWrnyAU70+w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE resource_nodes 
SET name = 'CP PLUS DVR - Channel 2', is_active = true, updated_at = now() 
WHERE id = '3353acf8-cd6c-4f31-aa83-ec8b1438b324';


UPDATE device_identities 
SET credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2',
    edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '8a8dacff-3466-4c0a-af91-e0e9f9ca8900';


UPDATE cameras 
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch2',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 2,
    last_seen_at = now()
WHERE id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', 'a66bbc0b-1d47-4462-9cf7-94b5b35824df',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:a66bbc0b-1d47-4462-9cf7-94b5b35824df:init-online',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified', metrics = '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id, observed_at = now(), received_at = now();

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', 'a66bbc0b-1d47-4462-9cf7-94b5b35824df',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:a66bbc0b-1d47-4462-9cf7-94b5b35824df:17912271119172',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', 'VzIxTrCsxtkufewC4b+RL/Q8i8AQfww2DhowfRR23s30vMC1jMswEMMZ+tmJj0BguW97z7oNMnnMrXk/vBuhTgiqlOL5c9dyAV6aIxNNBtIyhpjlA2ebbTlRTULt1x8UFo6bTQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'meo0AA1DQY+2qUBZGdJBYAzx4j/+86C69E07fGs53lJUEm1ErWdsAr7nGgqyzr164FKw9SPzV6jEjubVIIBWCC8KSNSgoJV8pNARSXNaoghloSv7xQoqbUU9nYFTeWl2INIDUQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'fwAlc4L28S4dGbJ0GuA8ik63Eba2xPS/SdDxYUOQEuQK+/t8ap3HwFpP831MpyQb69Fmz/+ZI4wdpmJInZEber6ZMMDS8gylka/alYvcO6nhgs4jakT8xGgv8e+egkiXbjctFA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE resource_nodes 
SET name = 'CP PLUS DVR - Channel 3', is_active = true, updated_at = now() 
WHERE id = 'bf4e8b88-efac-437b-a5d6-0c633f840446';


UPDATE device_identities 
SET credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3',
    edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '19e92521-4df5-49ff-9728-66986472ef24';


UPDATE cameras 
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch3',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 3,
    last_seen_at = now()
WHERE id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', '940fb6f4-7c41-4c92-b4f1-85a459ebb38d',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:940fb6f4-7c41-4c92-b4f1-85a459ebb38d:init-online',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified', metrics = '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id, observed_at = now(), received_at = now();

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', '940fb6f4-7c41-4c92-b4f1-85a459ebb38d',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:940fb6f4-7c41-4c92-b4f1-85a459ebb38d:17912271119183',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', 'pbg5cWY/dsv+g9PgLftaF1P8H0dxBkcEWzpQ0CpV5w14CNbvkI05zDILuxLWuoOK4wRoYO67crvkjpapD/9Qz61YXbXs9H45uFzju/ymCM8sRoAbI4zRPMgIWgnGNznv6294bQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Q9Hbd+n8C2686q/twSOSvXUZdqy2C/LKkQEH2Xn3GyhaWljMUKZSPMfNbgm4zEFGxNuBMFxrB3BYAtukXWD3qZaTn3zlKDeUwNxVyXJYucS9VREnEvj1lzvleJBDjA90LpSTYw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'u/GB2mFp30g4EcTVEzrtPs9ZVNWFaLS3oWNoMEBNTJwqI3GGykXDKCj5LK70bzyzCOgjwv22yVveBHaUjZVvBbmKeMj8hdI3hrJheOPH27VewT+Ib1VAbq3fnH0SF0pSO1UwwA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE resource_nodes 
SET name = 'CP PLUS DVR - Channel 4', is_active = true, updated_at = now() 
WHERE id = 'a8a43417-3d36-431a-beb3-d62db215e1ce';


UPDATE device_identities 
SET credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4',
    edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'f38c207f-cbe0-4d12-97e3-cdd2184f9e3e';


UPDATE cameras 
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch4',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 4,
    last_seen_at = now()
WHERE id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', '1fa8cd44-c782-40a3-81f2-a933fb2b1d76',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:1fa8cd44-c782-40a3-81f2-a933fb2b1d76:init-online',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified', metrics = '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id, observed_at = now(), received_at = now();

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', '1fa8cd44-c782-40a3-81f2-a933fb2b1d76',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:1fa8cd44-c782-40a3-81f2-a933fb2b1d76:17912271119184',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', 'j6GRlW07LoeZD7K++s2lw0W4MoSDYqEHladfX2krLzxxN/SkpMDM0mU/Zkd+m+JCBH/+iCECDC0XTD5NNNiZp1lRQX9zm8pcWZLAqlX12q2ONkO1KenSDgXzyKPVzkztYF7FlA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'QP/YrOeeahKna60UntLykCbczrjZw5D0Bvjc4BZ9d6WM/QGGDYmFmgWS12xuyXHsNZDeJzC9tHoaRjuIc5T1c1q4aH/pjey6cNFxJFNLbl4302xk34vRY3PpJiAffdP3ywaEgg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '72z/uZJcZpUStNirBd7t8MG3O18YG1qJOaa2EA/yMVNcDxcS6CM2GGYMiMEGgubriNcrbpju+E2a8DtYeU4LUjFoobKHKuxBOpb8KPLAUvd7WTNULr0izI8EkaE7LPy4+OaX8Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE resource_nodes 
SET name = 'CP PLUS DVR - Channel 5', is_active = true, updated_at = now() 
WHERE id = '13ad09c4-1efd-4a72-a222-1864bb356a26';


UPDATE device_identities 
SET credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5',
    edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '19908631-2fe0-45fd-8158-ff163b7ad4cf';


UPDATE cameras 
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch5',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 5,
    last_seen_at = now()
WHERE id = '9cf710ef-1a0b-444b-9c30-abbac95948fe';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', '9cf710ef-1a0b-444b-9c30-abbac95948fe',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:9cf710ef-1a0b-444b-9c30-abbac95948fe:init-online',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified', metrics = '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id, observed_at = now(), received_at = now();

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', '9cf710ef-1a0b-444b-9c30-abbac95948fe',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:9cf710ef-1a0b-444b-9c30-abbac95948fe:17912271119185',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', 'ropzu242ZSns3+nF4OwdF6gBIabZFaaYfKP3a9YA+zueZlWg+uYldFiqZS3vEJTvDQF7ONWlRR8xhzqhIef2phwXOx6CA6tsLqYuAe6sf4XIuFZpqTm2t0Ei0OAEyuSJj+n9FA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', '96vG+FCMIDHY6czpv1abH0gGOJs1Xe1ApG9gv2IRaJB+2s2rLOmm9Q1KqKZq5eF7dJuG34X1PT/jH4Hc9VMaH9NE6Kl56Mk/6WUhUV28VhoLuNXDT+nQq5NLkjgtBF+OV6tM3g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'WjtcPN1dsggQvaHdtelmFZKgAVHgNfedDkj3UL69haX68q3Yef2X4XTpBWAhGdllIHCBBjbpYlXvz1KoNDoE6bVOprqziDd9NGQ70a/LvsF56JqZaXeoo5R7smeI/HGHobA6Yg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE resource_nodes 
SET name = 'CP PLUS DVR - Channel 6', is_active = true, updated_at = now() 
WHERE id = '2f610afd-1bed-4438-ab81-2fe4dd20b0db';


UPDATE device_identities 
SET credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6',
    edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '4718366c-9acf-4162-b031-66a265573c39';


UPDATE cameras 
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch6',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 6,
    last_seen_at = now()
WHERE id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', 'fc1a1f29-8b1c-4743-a093-40584e1a96a8',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:fc1a1f29-8b1c-4743-a093-40584e1a96a8:init-online',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified', metrics = '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id, observed_at = now(), received_at = now();

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', 'fc1a1f29-8b1c-4743-a093-40584e1a96a8',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:fc1a1f29-8b1c-4743-a093-40584e1a96a8:17912271119196',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', 'zHa7oFlgej+qRJjvvDrZcudVDq9aCZIpy1HHSpcqdPz+R2Qv/90nUHUtL7xoXHRu6aZ3qHh31S8y4E+Mi/S7Fk7LeKOMDQt/WT0LVcqGNKCJw61J4EJRbDWng3zSG0kU3YOR9w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'i3/8r9/hjc07vYBOJobDWrTzptk0x6qdp6hSW12+6WnfkrjXhg8SM0fS1+47wUtBbMgp00fx0MlnrFChiVpfphPi9BC2v0lkOoie/GEOYJStSfuF2ZIpUSRiVauZtnZhhXl6JA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'cAbamkPmyAWufZmoRsFQA9s5Nz1XuxGGKfCxc2nP211kQvgmFzdaEt2P6Vvy6HGhmEm+wkcnIr1oLNJxX8ILldrH3UhvGr2wNhVojzuj2bqUg/lqOVaQ4i2KuCSPlSqP9wCLIQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE resource_nodes 
SET name = 'CP PLUS DVR - Channel 7', is_active = true, updated_at = now() 
WHERE id = '427dce43-3832-42f5-9cde-92337ce690e0';


UPDATE device_identities 
SET credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7',
    edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '18325705-cfbe-440e-bb45-e668984a9f05';


UPDATE cameras 
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch7',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 7,
    last_seen_at = now()
WHERE id = '3baa601f-67e0-4e0e-905d-0688df725bf1';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', '3baa601f-67e0-4e0e-905d-0688df725bf1',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:3baa601f-67e0-4e0e-905d-0688df725bf1:init-online',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified', metrics = '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id, observed_at = now(), received_at = now();

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', '3baa601f-67e0-4e0e-905d-0688df725bf1',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:3baa601f-67e0-4e0e-905d-0688df725bf1:17912271119197',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', '8LzgoJNZ9e19kCKkxX+Rsn28tprFCdHjZMjKddG+CQKj6UyGFQaavZy+ha/ZwndSRBiB23yqPG9FF1kxmEjI7Ls4yVk3kkVCwmjhXfaW+a1Xp3wKqQMATKikcF4xbbqXxa/Q6A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'UxWW6IpBL3RC8Dw/H4IC3tLiU9lzoZdFGPjbgnX8BD9HZ7GWaO9iiVcvuMUSfKHPNRCFIORGsYczw6h9dbgyvw36biSWfnaYcbx5qyxyXwvTh6bqFvjJ1ECEAg7yJgvoPYyiMQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '8tJFli9DYG5xAD7zHQV+n2gcyBB3mNvI4TshXcP82Z2twICjCdO4yfaRqNRpxfOHZaYUzmmeZMxE+6/qfVsdBmE9arJ0z+WApcku8LtqgoZ9s1Fm7dxF8C1hGirYrcwiGAq3eg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE resource_nodes 
SET name = 'CP PLUS DVR - Channel 8', is_active = true, updated_at = now() 
WHERE id = 'cb1ddd34-aea7-4356-9adc-aa2aba9c0d7d';


UPDATE device_identities 
SET credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8',
    edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'a8b9e400-2b05-4127-be7d-a47fe4c1605d';


UPDATE cameras 
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/peravaruni-ch8',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 8,
    last_seen_at = now()
WHERE id = '14d869da-4642-4d74-9de0-c4c6c2be4488';


INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', '14d869da-4642-4d74-9de0-c4c6c2be4488',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:14d869da-4642-4d74-9de0-c4c6c2be4488:init-online',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified', metrics = '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id, observed_at = now(), received_at = now();

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '9f108498-4dd5-4a21-b810-eec9e538953c', 'camera', '14d869da-4642-4d74-9de0-c4c6c2be4488',
  now(), now(), 'rtsp', 'verified', '9f108498-4dd5-4a21-b810-eec9e538953c:camera:14d869da-4642-4d74-9de0-c4c6c2be4488:17912271119198',
  '{"fps":15.75,"codec":"hevc","width":352,"height":288,"status":"online","videoLoss":false,"blueScreen":false,"colourLoss":false,"severeBlur":false,"bitrateKbps":175,"blackScreen":false,"imageFrozen":false,"streamActive":true,"excessiveNoise":false,"responseTimeMs":3500,"brightnessFailure":false,"packetLossPercent":0,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

COMMIT;