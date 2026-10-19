BEGIN;

DELETE FROM camera_credentials WHERE branch_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND ip_address = '172.29.91.100';
DELETE FROM camera_credentials WHERE branch_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND ip_address = '172.29.55.100';

-- Insert authentic credentials for 172.29.55.100
INSERT INTO camera_credentials (branch_id, edge_agent_id, ip_address, username, password, scope)
VALUES ('d8467a57-dae8-4012-ba5e-c3254075aa61', '6dd10cd4-5625-48f4-8431-23776bbd0795', '172.29.55.100', 'test', 'test@123', 'host-specific');

-- Update branch assignment vpn_networks without 172.29.91.100
UPDATE edge_agent_branch_assignments
SET vpn_networks = '["172.29.55.100/32", "192.168.250.0/24"]'::jsonb
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch1', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'Odz9uPM1Eb83Few7tIpcXJxUDUG3xMbo3qeWJexTnk5sBYWcu8iPVCn7cZhzsoqvwE1FHVgq3E+QqDS1eRZjGvSOxuX0TkWp/6j0Fu3ToDx1fxc8b3IIrNt5uLB/X9yuKivBow==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch1#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'tU7LzIh2q2ErkKGIFer7XEEZ2oFAF9FQ+jWfwA/MEb44EYWObbDY1DDxvTggZ8f3jmPnD1Z/oFovoXVP6RnJ+DGjulXRLoWWkky6r9cmj+Aj3DO/0+Ndv8L3WQeWS3kg+HvJaQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch1#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', '0+31Pnf8Qp5b9xJ0LqI1rqtTeK2zEDR978IqWGuKXYwgGgKNsy2n8gYvl+qEvcyOX7JZWTSFCCj2Sbqc/pkurdn75uau4NqY2CoH9T7I9RXZ3QJZGuromhz289FxxkO81DdxQA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch1',
    ip_address = '172.29.55.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 1,
    connection_transport = 'edge-gateway',
    last_seen_at = now()
WHERE id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c';

UPDATE device_identities
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    credential_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch1',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '7865ebc4-90a7-4cf7-89f7-c56b29599eed';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'camera', '4d3caa3d-e03d-4689-81a6-a10e6f26329c',
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:4d3caa3d-e03d-4689-81a6-a10e6f26329c:pera-55-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'fMRj1/wzOOpnefnZRJW7G/d05qRifKZH1BtkRjcyInmoJserZfHKWmi0Q3d5H9EOxYx8aJpL0WGTQhNr/UM8JFFE6MVJv5hfVDhHqv2q4hDy5yDVr+tziPyaT68714L4gfS2tA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'hfP4d8FCb4IqeWJDkZt4zAbjTnr7F0Sj3CPF3kB5aAu1FcSMJNHuJMO4qDJkcU+tpGawjwlVvu03znGIst6MwIjnW82yRTZUmzKlAvjGKRmf4bM398Udf3psYyjN/XiQZoc/Kw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'cpwd+6bbV1iGvZR3+9JGaYA0fwskXw2iUQ25dkWzBFQyXpp4pjwObzDZaaAQOewgxpX9Ku0GmoBjI2ThX+qrZzL8Iw0maa2zS7sly+jRUXjbK4Fm5BOw6LfYhoUP83YL2sDykQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2',
    ip_address = '172.29.55.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 2,
    connection_transport = 'edge-gateway',
    last_seen_at = now()
WHERE id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df';

UPDATE device_identities
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    credential_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '8a8dacff-3466-4c0a-af91-e0e9f9ca8900';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'camera', 'a66bbc0b-1d47-4462-9cf7-94b5b35824df',
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:a66bbc0b-1d47-4462-9cf7-94b5b35824df:pera-55-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch3', '6dd10cd4-5625-48f4-8431-23776bbd0795', 's2aaxXjS1HHfZSvA3nQlY7CYrEyjBfI8yJb0W9rh9e+kvPBR7/+4qfr7BcLm4zYwyGvfOIhBZHpmjjzTEyyBSs1W1x8mYGR3IYJAB0541l1ZQhtq+KdDFi0F2NZbZCZkOBk4zQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch3#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', '3wxKTRzqggx5GAHpzxVommABJh7Oq2nD9+RrHMFqYBI28tZo/NImNNdtneGfC8BbpD8JeWfEWHKkRy+Iaor/tKUW8TpWGZGZJax32ON3JAt+XggDCxDBqe+aYJl94gudWscprQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch3#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'cMYkaoU8gi4xBr/YOI0Jx/VtAbODJIQDlCTAumbNnzDa9oBWvrYUGQ8U4EQKOuRAyOzH1lE914sLpioE+QiWdz5XalBBygCtKCPIcUAEOZQoSvxF7SZCgfcLyy6OqS1qOfzllw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch3',
    ip_address = '172.29.55.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 3,
    connection_transport = 'edge-gateway',
    last_seen_at = now()
WHERE id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d';

UPDATE device_identities
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    credential_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch3',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '19e92521-4df5-49ff-9728-66986472ef24';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'camera', '940fb6f4-7c41-4c92-b4f1-85a459ebb38d',
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:940fb6f4-7c41-4c92-b4f1-85a459ebb38d:pera-55-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch4', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'Gc3AJ6mhwnev7rop0SX1cJuUuz6rHYtsTHhsvrXCOQbDbBsBAaRwG5sL8HuwJTqQtQ0iAlNeE1azwSN5lMpZfhtnsbLVwTMGeH6P2cXjA+BFiOW8sEAbyGTNo5Ox8c3EjXV8Nw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch4#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', '+TVG3Y1bpF/2vNGpt9ghfEqxttiAz/NAQIs7yt6AVDw3/k81BQ/nc342mcXk8ywh/QwWl0kGKEgbnvMXd9yhKsWHDf3GtDYd9Mfb4YOkcqNWy5hgobPBMI5cmkdAC/qxiLhExw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch4#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'NupTeM0YQKa0pyIbVyjj3vTe5YPg7qQHlmFQ56/8qdcmMYDaX6ROHBI5CkTBHTeYNF8C4y6bMgtWCi8NF+ez8LYmk7klLNC4LpVL2MFdYH98qF9L5HbDEQdKhfpfFKzOe7hgKw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch4',
    ip_address = '172.29.55.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 4,
    connection_transport = 'edge-gateway',
    last_seen_at = now()
WHERE id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76';

UPDATE device_identities
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    credential_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch4',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'f38c207f-cbe0-4d12-97e3-cdd2184f9e3e';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'camera', '1fa8cd44-c782-40a3-81f2-a933fb2b1d76',
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:1fa8cd44-c782-40a3-81f2-a933fb2b1d76:pera-55-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch5', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'pMCRlGXP9lQ//WK3L5mTYcXlUtZeTG+KMhaGcl4IJddJRXHWCMWSebdnMH8CpGLQVre6CPSa2uYlCJEV4+HKIb8RAq2D6nyZQeLwg/YTyrkxPJIAdz0IitJggGT+9+d4uYKf0g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch5#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', '/h1vG0iRsAXGsuqppXnfMjOL2ZKN8lRZjPUK7CqTQ63bELkyjljvIgCCFxhHQvuTI+cL2gRam1HTFSn6SuWpKzuAx0AZSORKfRi/FzBmNAr/FyNcdC71+DP9zfj5/0plTqtNsw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch5#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'HVvqtLe1U4KUIGigoLuGEhq3WWcU8etgXw0nRx4NLqz8FRXO6c4JdHD1ABRrx0LJv5UweOW9pniMh6G0MJTDPwsrEHI7vTvwn5KMiQl8Ziez94Rwp3yGyiDykvwPDr6HSPEP5Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch5',
    ip_address = '172.29.55.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 5,
    connection_transport = 'edge-gateway',
    last_seen_at = now()
WHERE id = '9cf710ef-1a0b-444b-9c30-abbac95948fe';

UPDATE device_identities
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    credential_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch5',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '19908631-2fe0-45fd-8158-ff163b7ad4cf';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'camera', '9cf710ef-1a0b-444b-9c30-abbac95948fe',
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:9cf710ef-1a0b-444b-9c30-abbac95948fe:pera-55-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch6', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'O3hEiAGbNVLw4q0v5clqTU7juaCqjRG+tETeWMuLINFZAcDJm/Nm9YMmxgnxEkKOL3bHESwMygIeHHSv/ZEC9cFj3g1I8+LypDE0jirt+6yaeCIVqRerUHxiK1ggrp3CV6FRaw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch6#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'ijGCgj8GxYth1goQlam9AJI7SNDqHVUifoZqMHwtSPqPbSMBrQoYqWNwNjx+VsPoEfMwurCZO3gN6rdKu7KzrBGDW6YrzXa57mn0255dFpytQcBTM6hwRZR0JnEdYPcoswl5TQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch6#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'QB8amS9x9W+vPPcqknHDjN0fWv7Olfz1zdnsi0gNuLDjQpTHpZG4+MgeshRRHzMBYOCTwoEZ/BpJr4I82n/ii9RwH7x4ONLTaRwSqnq9gdE40GCubC9F/wQtpzCuDVVZUY2woQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch6',
    ip_address = '172.29.55.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 6,
    connection_transport = 'edge-gateway',
    last_seen_at = now()
WHERE id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8';

UPDATE device_identities
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    credential_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch6',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '4718366c-9acf-4162-b031-66a265573c39';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'camera', 'fc1a1f29-8b1c-4743-a093-40584e1a96a8',
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:fc1a1f29-8b1c-4743-a093-40584e1a96a8:pera-55-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch7', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'KCkb0efJbxmxiEvnTCSuPF7Q/Famj/RMiL/ZufYe8ZLSLXga4GfBvpuqAUCETpY7fEU5B7SYldxleawIQtid+MP+6h6tgtbDzbToNIYjhdlKcBs59fsfCpznlZB24yUMna0yvw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch7#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'rBSKWJJSTcYxCgCms9daoLRcT0Mnw6uA1Zfskz0HF0ITza7QrQYKe+yHrRmle53QcDRpP8UVjRi6z/5TawuAmeEYTng/WH14H8J0pSuCKFWr+7UGJXWBBne/R9eqVmUMJDNASg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch7#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'YrTu9oijapvRMD5kPLPeNIfMosleSKcK0LY/Tb6stWQseBKcSKTc/qGLd2tlu39Yer6Pjrh0UM+QfOipj53/BgL3a0+yrq3w/2ULh1R1EOYaMn6Uj17AdFG6KfwMFQ4rdDSz+Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch7',
    ip_address = '172.29.55.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 7,
    connection_transport = 'edge-gateway',
    last_seen_at = now()
WHERE id = '3baa601f-67e0-4e0e-905d-0688df725bf1';

UPDATE device_identities
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    credential_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch7',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '18325705-cfbe-440e-bb45-e668984a9f05';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'camera', '3baa601f-67e0-4e0e-905d-0688df725bf1',
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:3baa601f-67e0-4e0e-905d-0688df725bf1:pera-55-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch8', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'EGgEDi++CrKmIdzNg1iaYy0gg/eqYdWpuOLj22CYqorNXA8uBKwFmz037M2qtmTY/2kUPRIt0Y32LzAOQSZicdZqqMLc8j4rkM0qmcxHFbNYOZWpXd3Hc/AYVlbcgpZywm2srg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch8#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'AwfcuAV4lntpM5W5QVer7VkDGYCZJjjVF+cBNyUSn/t4iEI3nXbT4l+IHVu/2J1jQUO4gGTVQ27HwCU9UNLT61U+XQ93fI1UeWfj5JuNI36gwB/9spYKHjkajBNkyCKykYI9BA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch8#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', '1ifm7dZrNxcs9JeIEUKH6xgzH6s/XfXYpoxp1aWeFVYMMQgZheJTGSftWMTeWrWEGfVFvo2mFdO7JaxgexgzI958R5REVxJRPEAXCwZB9tl1WRDlCmdBltxtDG1myebI3VX/Yg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch8',
    ip_address = '172.29.55.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 8,
    connection_transport = 'edge-gateway',
    last_seen_at = now()
WHERE id = '14d869da-4642-4d74-9de0-c4c6c2be4488';

UPDATE device_identities
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    credential_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch8',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = 'a8b9e400-2b05-4127-be7d-a47fe4c1605d';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'camera', '14d869da-4642-4d74-9de0-c4c6c2be4488',
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:14d869da-4642-4d74-9de0-c4c6c2be4488:pera-55-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();

COMMIT;