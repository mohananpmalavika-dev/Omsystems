BEGIN;

INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('748eeb31-76f8-43e9-9121-4c1d99166e87', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '["172.28.36.100/32", "172.28.18.100/32", "172.29.91.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1', '748eeb31-76f8-43e9-9121-4c1d99166e87', '6lBzUOKVNYHvW9INz7oD8NaKcmEbAFnUDTJc5rIzldTLzIT5Y3e/Qicbeaxm68LJPBRwcxdewmpdGJSXOeAIMtcVYN/dMfGbylDczIz6rMe+Vm3NgOwIBgmLn82Tlw3KgbKRpA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'YMwl3s7tniX7eREHAf6XF0TEe6rfl2wHgUd3oOL11/BMfR78R/ehr5pM7YiySdaASqCgJe3QH3tv2oF4P3XIMFioVeAzALSyAjcgx/ePSKQjoBJh2I8VECByn/DGLUmNIS/W1w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'Tgx7/cU1EMEH6WDuBZwZSrb7avh7u69AeleFO+O+wjN8afIvNuc8mt9v0ogrYwlVD4vbvflkRlLs/E+xFK3zhIAwePyJzqJHUV2hgt8RG6L3H6PRVb64iq+T5vqzdTkmEFrNUg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    recorder_channel = 1,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '574ec320-ad4a-4c40-9a6d-76fa7cf7d13c';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 1;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '574ec320-ad4a-4c40-9a6d-76fa7cf7d13c',
  now(), now(), 'rtsp', 'verified', 'hajipur-online-574ec320-ad4a-4c40-9a6d-76fa7cf7d13c',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'iAZSWF7A0Sbokq1oYYjqOnck41Wu2qGIMZSdvAQ6Fy4ymYwUiXp7JVRfVexoOdIK0sHtg7QFVv0FA3bhAHnxzmrXO9rkqX+oadlEgtALKb30ZPXuAUyFHxgyKyzKpgmu9RqBvg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'GyCz65g0KAJhQXq4X7sipjd/kGPypX3k8mbezM5bKyZxLC9Ly4rUKRMSioGRomsAXTL4F9VbL3bk40TxF4n4/YYC7SOg+s4Qdas0xG1K1nczoAnPsodw34LB0IhJDhOsfdSPYw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'NnQ+x7EGq+2vxgL8pZUD2EAAA1UJCblb8HRDc+1MoRbBxvQcICiauOl0+IO1xH1EGfVZ0NeFW22u8owyfzCzoqkQq4oadZuk5ZKn12cKUYUzuSBRdDPGD8mbRRCN5ZRyo6puuA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    recorder_channel = 2,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '25175a3f-562e-4138-a827-91518096937e';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch2',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 2;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '25175a3f-562e-4138-a827-91518096937e',
  now(), now(), 'rtsp', 'verified', 'hajipur-online-25175a3f-562e-4138-a827-91518096937e',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'eAmOLFnnM1xiZIEEPUhUptsS7eW5zU9+MDIqJ0iycR9Y8d9AY4ezCV9rMelJbSzENJrGlK5VEYcKyU86zUXAWVmkp7AcdU3knF8oGwWMmae0lI3IPTJevOYBcrWq0NpUdDgWDQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'pHQ6lsyaG3n4dmblVZ1YUTfzJqm6vqrPeQq52yrzs2RlJUBtbdBEJLkqz3EVwRj121ZtpOcqez1wjlvq0U/z7fA7YRju6JGi1490E5MrmG4NNHK52MI9Pt7Wl/FSXfL136Oxmg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'WY6qgKx08e+MdwoY81VnBzse4GIcmOGoFynD0AArwwWBf9SNb+PI7Q1yNgp7HaO8lH7tizGbzBlPNhqCWzmHVfUzjz8vFjNCDsDVrJo+rMpp/GNCMQnoHu4crkzG9KhrU8vd1A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    recorder_channel = 3,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '5ffde9b3-924c-4622-aa74-b3c406567d7c';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch3',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 3;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '5ffde9b3-924c-4622-aa74-b3c406567d7c',
  now(), now(), 'rtsp', 'verified', 'hajipur-online-5ffde9b3-924c-4622-aa74-b3c406567d7c',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'D1+Coy0QG6dkfVGSfSXriJKeLCfDnNPDKu2FyIeouBSrOt11xD1JuqEcEmrcQnyll4ZescpBdm8TWOq8LPQvmWOJonNCfa5wzVxj995W7CXWSVrQC2RSmpTyhkVEj521y/nbaw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'qcR62yjHe/J1QuqadR25T/gAuYXuyJ2poo5FUVSgUYcvIu95E9cgR0HNZXDlrzgzDNTcm9o11QMV2af3kRj0mtaBf7q7fhCRhrIepd+Hg2+lzoilgKrbLJlDPdl/g/R2Uo0NiA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '2zpQR8YZvOJ8k4Ap286Esn2dZkfLDU2MLWk4CR4ZsrAf3pjsOGUmmDYvIfYjXitYZUq/fwOdfRy0mH2N5uo7yMbUvrHGLOKYYDvtfoEpSgGRKwMzeyS98py0daOhUMZ+WmK8uw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    recorder_channel = 4,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '80ce1672-d553-4e85-b2e4-3758bd744eb4';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch4',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 4;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '80ce1672-d553-4e85-b2e4-3758bd744eb4',
  now(), now(), 'rtsp', 'verified', 'hajipur-online-80ce1672-d553-4e85-b2e4-3758bd744eb4',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'jvAex9u33957bw4KOmfoRisw8x1+eMOEWSOCtdwoRXnO4DvmPu5h2eUwU/js2UFuqvQeycjz6l+T1MWZv6Lx5jtN2/M9Pya0KXU/HkZFOwsgDGAni7clVH3XYgcjTKMdra2xBw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'VarGpJz2V/x5b8DO9IN7kGT9/otfWmk1gewLx6Zfb4tkMq8edtbVcFS4zd9abIhIC+Bd7D7oCsPQ/1lo1QO0LeU9RxQ9d6C9cFQIdoZz7Yhj9GMQ8AhtpSGtDyLh+Y5jQyCOvQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '9AHDvLsfiqu64NaGzPwR712YH2DGHrdQpskD1foPBQwWfOkCCVT5Si6Wj8DyxdXZI9doGmg2IpXoTvwx1XlZqE89+SIAjQMnECgX77L+UqyEuX/oKwnflbzIxSYI1OSUb1E8wQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    recorder_channel = 5,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '84ae9288-43d5-4721-9587-8b2d41d44c54';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch5',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 5;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '84ae9288-43d5-4721-9587-8b2d41d44c54',
  now(), now(), 'rtsp', 'verified', 'hajipur-online-84ae9288-43d5-4721-9587-8b2d41d44c54',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'kAiHrz8pDxO11QdUQN31pS7hAmH0/lsSvUTD8Bt3WkT6Z897ZX69kRk1lvLV6x6wghkzcZXnHchKE27WqJ46g7IiDvwjFCEmBbvv2h3hs8vo8zYO3+sxoA4HMyhjjYRGBd/MuQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '0PFzgq1aRk17CxuMFVwEjewA60kBjKm9ZPGpWKvLwSfDAHgMrIx5fx3k3Ls5twVRBgB/cTV3UVJecaYKdxrPBxch708XF2Q7g58gs22zb0ZqHUUS+dYe9M+1HLdjm3N2EQ9Shw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', '2KR4nOqY39WJE3aX5gIpe/ZcOXxQ9qvcJmEoW/DMFVovUf4FBroKika31bW3ZN+WlsYiY6PDmK3e69CtnutMF+rz+zoBKzXvL11nX9NmMMn0AxySOq2mEcZgCFhJNFmAryb7tQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    recorder_channel = 6,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '88137ebc-8df1-4995-824a-99bfce6c2225';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch6',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 6;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '88137ebc-8df1-4995-824a-99bfce6c2225',
  now(), now(), 'rtsp', 'verified', 'hajipur-online-88137ebc-8df1-4995-824a-99bfce6c2225',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'du+R/tbROfvwtF+APFVCQQqr7j1m/+TgouYrAJRalkTON5VMu1km9cu0GkGKh0NiM+PE8XKAOyN+x7bbnVPoww/jIYaMZzIT8zHQYEcn9iVtAyuy1J15GBPK4Usko7KJxnyhPg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', '60NZoDXxi1outcQeoh2xibZ2g4UKn/OcsBUI+dV5M94qSNzLbIdd6kC5ThDc4Kbc+XAz8bOqej0mwLDqPBSdtomF2UNf3M7Pjij9gQSLAvPykI5sBhc/244mfVA4Xlx7MMJA3Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'cdu1lzi5UVxiNIkDFMb6OvwfJt6cw1svhg8NhcTT3QXwilyBoPLD9Ezyl3vw2qR7bu/KoCH0SEtZrKIQuAN9Prap7ZKsQtgVOTXVoehuOIzg3O/fP5J6AXHZrc/7FwicIUqqjg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    recorder_channel = 7,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '8a2fa6b2-78d5-45ce-8f18-f3495ec3ca94';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch7',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 7;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '8a2fa6b2-78d5-45ce-8f18-f3495ec3ca94',
  now(), now(), 'rtsp', 'verified', 'hajipur-online-8a2fa6b2-78d5-45ce-8f18-f3495ec3ca94',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'jZEV/iytTsYu3SQgaEQnpgZfaN+X/ifYwR9h6xp5FbvCFN9BySJ6sENHrLM1jM7uTvBUW62VgPeCzrbrY78u1V7TGpb6TQ8hhzXzhjMZoKTPVWAaKZTjKH37bVruHhMt66xBUw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'WhSbVLlovfI1URQ3l/ROeJ81Dr7Bxk0AQ6flAtNU/e5IXVgTxYG/yQzwFHu9Nd3ZSr0J1+o8G9EctLd4AcYcvU/9qWXdOcFcFrJCq50NWUiyosZrHm4+PpEaaYViYXXle8gHDQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'EMKef1vSnnszROk2RQ/FD5GVKPJWedNycpddqVkITyx93aL6VU3az2ik0fGS+shKwoBhv9hsw/r98KRYh8KZj5SI1kJW9pZMftv508PCnY7Xy9mffj4C4+PHSmabS4Ru7Y40oA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    recorder_channel = 8,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = 'aa6e8afc-07a6-4b05-b962-c4133f79e306';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch8',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 8;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', 'aa6e8afc-07a6-4b05-b962-c4133f79e306',
  now(), now(), 'rtsp', 'verified', 'hajipur-online-aa6e8afc-07a6-4b05-b962-c4133f79e306',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch9', '748eeb31-76f8-43e9-9121-4c1d99166e87', '9SZnhOxnbl33ZgwbOxq1p7+3qM/MuTxCUs33EtIcLW/rtDMI4c4m59htCfv70adcbMAbBrauGwrc53ikn9Y5RoOWb9ZQFpCEoLMJHbLgvd6APKYnLFlkggvVE1ux9uDKkMyIlA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch9#sub', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'VKtffxjntGtWFqdju8w1ATfTW+GQL+Ac5JkFV4jRgmIfknGjxI786MFz6EHD95chJxtMiq/8E+gzyWw54r8mOeYBOPUF+2+w60ZaNgEhpLRhhVBs/+be8LXxcVGwEYwd9+vzng==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch9#main', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'VtyCxtMVNp9/b8Nq+xHI1Zjgh/Fts7EvW4LBAV2sVV3nRuQy8fkYwxPy9j/G8HoCSfsZCvUzmFWKObm5nTWYJiMih0AgqfG/phDLVl7/FOeVpo72+ln3x7Gl9/rBStASm8nGKQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


UPDATE cameras
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 9',
    channel = 9,
    recorder_channel = 9,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch9',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '3c2101f3-4569-4083-8eef-e27670e26a14';

UPDATE device_identities
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    credential_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch9',
    manufacturer = 'cp-plus',
    model = 'CP PLUS DVR - Channel 9',
    channel = 9,
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND channel = 9;

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', '921d336d-baa9-4b25-9f9f-f6542bba94cc', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '3c2101f3-4569-4083-8eef-e27670e26a14',
  now(), now(), 'rtsp', 'verified', 'hajipur-online-3c2101f3-4569-4083-8eef-e27670e26a14',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"videoLoss":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];

COMMIT;