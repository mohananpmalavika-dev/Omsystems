BEGIN;

INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('6dd10cd4-5625-48f4-8431-23776bbd0795', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '["172.29.91.100/32", "192.168.250.0/24"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch1', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'VaCSdUodQ3gPfkeS5ZXij0/wfRpQA4EGzOfVGzRP1EWhapVXrhurYRrHAC0l6VOLPNGrur4X6VGmtFKZ+4wsHR3n7fc+dAWzAL/Yduk7SfRPOcgZaoNWrOITLYTwmvIH4kpwdg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch1#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'is8EF2WohZnFiko1Fkrp1S710Wz6hw9u6SXVTMN0dvF+ZFCfOy4eJnk/NMSP4tyW01M67uC7twoxV3z47tSnoGTWfEZf3QFIra+epRW2q/qJ75oXiuY4LEiTdC2Al5sZXTvq/A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch1#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'yX0JPzIjHWUddjXp99BUMIVXlE6cwvKugOWz/C08mTq502XnDZVN4nhnFTbmjTL08PSM4NizqvyxvuyEzwpMQSK3PXiEjKFGjFZsvc+eP6cV4AtXDExL4atW2FmpZ29Eo6duTA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch1',
    ip_address = '172.29.91.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 1',
    channel = 1,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-172.29.91.100',
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
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:4d3caa3d-e03d-4689-81a6-a10e6f26329c:pera-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'he/cV1B4RvWLsxvPveRNLKLLovsn8CmER4LU1BJWOc/TSaP85eue1kD+FUzwKM9+OdnOfpE1YflgjHhgcWB0xIoh4bVXl1hJktOat8kVw//TOAEHABxn97cgn50ylRgV2OoB/g==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', '0VdLSPzLcfOwKOKEMaET0Dkfv3ntEKWc+fd2fhokoHCpLfS6Bs1eRvRiG2OBH+jKabA+mkc9yG+PI7iaNw17rJYmquuMTo+h5yQIFvVhN95yn/FO9hZCwefRRTMBRTOLYDxV/w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', '9KKc5WMkUaBXx2RX7kwamj/wKpjUG3V+moK+yF/sxkmIx0EvZIduA4szlbCbto1tswDI7FSG0TCzaKTfgQHALFwud9ccQSZl17EcFlGDFRPS5WuQUwuxWJyWI5fPb6g4SB44/Q==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch2',
    ip_address = '172.29.91.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 2',
    channel = 2,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-172.29.91.100',
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
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:a66bbc0b-1d47-4462-9cf7-94b5b35824df:pera-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch3', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'SarA8sCGfUs6SWO9IDosnknHbqBi/olcmfcJZ1QvGlIF82gLRcfCJ3ccej+FP3++XsJVygWGscFfePxaMh6S/x2jOPuAfapOUPzVSA94ly7jNr97G3mOKG293/k74YLz9yZB2A==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch3#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'ffsPVTj1Jy83ct5BcZvykKDocZvt0NfH0vTJWKG3UGzMxyCMyQ1FU7J3sKp+X/MYVTfOgrQkfP7iXOlnXKW0FB6L4Z3tZjxd5MrqqGoXMWH4CC6Ej4qq3OnzyNla3lLAz7/FOw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch3#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', '2o9G7XOMwbcPcDhv2ZTbpHDawFqMIlgA1vx4enVdoMdNt0GhRYthAAp8bK3qL/Z6II4WerLhH8eseBdtZehMFUBTv+J4O55ToOGNlGCP1g65cP/KhYbQxuAO5rUeMTYeKUSVlQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch3',
    ip_address = '172.29.91.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 3',
    channel = 3,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-172.29.91.100',
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
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:940fb6f4-7c41-4c92-b4f1-85a459ebb38d:pera-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch4', '6dd10cd4-5625-48f4-8431-23776bbd0795', '6q2rrNPal1TlatiG7BLqC43BHu+hq6ub/RLRuXYE+5H4B/g3qVKzBY/PXBKv3IARu+qBNrgsqYx/4RS9Y/J1+SnjiHDFFpDg93TSR9YnceXnJlqM1E2qyH45mlQMnX/jKRlE9w==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch4#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'LTMPjJdlACE+uGC3tB2hpuIJXmgD5zdJvPxPB+s5RTFpFNpctduftF2I2SMkeC2T+RQpPz0dvrdkeG8kjaPxbODR6ybDj/nRfhqVZs+xDmbKnFFVSBHLf9WRzVlM9VohLfGBpA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch4#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', '8EzvXeNwtagc4ZOjTE2YY0cBzeflIEtaiYLCmxG5bNjkShEaXKdNQce9astH60AQrxCNgrLWkv+BCTeo2tJIL1OlWJPjeKstSewPEnU3rMAxCgjNhFkUCHxowOVzFAgIF2SJRw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch4',
    ip_address = '172.29.91.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 4',
    channel = 4,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-172.29.91.100',
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
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:1fa8cd44-c782-40a3-81f2-a933fb2b1d76:pera-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch5', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'skEtA/1awe8MSYLTowlj2jzp4ZLdkZaP5xT86FL6Vjk+8kQNMHxe9uID3AmlgyycLdFmgcgtOudr1XJuq4mKyY0JbgTovia2AhrZxHV8idlzwz90NASe9lYafBmoLzzTQL6ftw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch5#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'PEKYY/tT3DP0mctJg94tmIoUoQ5bP5nBsZ845PKxp2TJUxyL/hI0DHzNauG9T77MhSyThLafoOoLHJ+PFxIsN9k2MCEgjdKrQsTqlhHu9KGAVRhsX9lD437pgBNj6bphn4e6PQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch5#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'z+uvqj78ibFwAXFj54a8/5sh8sdYieqnjZAaV4D7SYfuCSuStA5dZb7fWFxdQVZ5sOtaig8rx4GFWgTncLmP1I/O4KIFoWVcouKJ9WG03BTcMhLD0bbfSoQSnkeh/5KGhG4xZA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch5',
    ip_address = '172.29.91.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 5',
    channel = 5,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-172.29.91.100',
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
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:9cf710ef-1a0b-444b-9c30-abbac95948fe:pera-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch6', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'lquytveLo8ngPigIMX90tndPY3opTbqr1Bxkzsb1j+fYZq/TB61v6scN+CzsTaULmoh+a7V5rZ8GK4lWs6KVwzQVPE4tcRblwmWBOHTLi0krZdlhGTm+YxhrRt5yj/HOdV1aiQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch6#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'B6luSiGAWyINcNaWE5jDJRKinfYOZ71E9clwqjDcvLjeObzNio6J/GRqCBokKPvNbrL7sYjiAtCRlK9SammTeZWMmwU1s0rvEgc8BBoQRPAG7xY0SAFLgjuIDNavktxWHUXyWg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch6#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', '10akXqXyK+6YHUk4dnE0BHg91euDA734sqC0ezVxTppVnaIud3cVcxsc0/q1SvWUkds6GlC7ydobdKL5rw6vowAaYkdbUA9DIAQArw99NXnAfkl8+ffRFla1JGuRzwvkr9iLew==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch6',
    ip_address = '172.29.91.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 6',
    channel = 6,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-172.29.91.100',
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
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:fc1a1f29-8b1c-4743-a093-40584e1a96a8:pera-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch7', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'Z+L6/LTE6L5LTnvvZC75w/vHu0jJgVCUKvB5mHxEtAQuSywjDTY7wa0RTjtStnaWqeBklihzr+6nz2P8BBmUYR01sd4Fo5zwc13c+CZHeNHK4xd6WSwKu6wgYH0QicXZ7CJtLA==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch7#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'VZKEWNcvKs8EQ1YuYY0S1Noa1GCJ4OJaJkm9SlSfQSoASWKLZkm1VMlZTKxBH4dslxJhc1xcZqQ9x9mobcpEzktxkPhnqCphjtP34O3ZBf+R98r88mOjACCzuUCIjRTPE2JHzg==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch7#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'AO90Fhm7Ql01GvGH5SSZr9UzZWNhlhOvPsrDeyi/xyM4XubHYQ2b30KsRHVxQWTJEhLDJUelg+Xg5m5pRb3v5xf0cCZhJhjZ5sXCggQSL2EzfNTcJt/jB8FAK9Ba1S+JlexcqQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch7',
    ip_address = '172.29.91.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 7',
    channel = 7,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-172.29.91.100',
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
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:3baa601f-67e0-4e0e-905d-0688df725bf1:pera-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch8', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'cJlxtNNr+AAuOsEOibR4s8FHBwMeNk3EciFgbFgk10mZ5xYDHz3/d3W8KLRcUeYMeCDwxoKR10GvDMSyWo3cIL0L3QSBl1cm3Tw5t2R+xFIP4hqR+34CRRGmeIpYiWudWyB6oQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch8#sub', '6dd10cd4-5625-48f4-8431-23776bbd0795', '2NYGYIbVVbeLI5gMycCKw/X6WHlp6eFP25gJmvxoBJi6UuqKC50LtmWFs3tfqAFT0rcpfnrxB6sT9xm9JFIBFSBg/o03PHqMrM+/jY9z/0HndM9qRSFDhCA+zhZc3WjjcG1uFw==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch8#main', '6dd10cd4-5625-48f4-8431-23776bbd0795', 'n4XDwHPbDn9dvonm8h9Sy1uawkJNjbbWVLLhpXDJsGtN0bYuBbX0mGKeUJiyL9rlLlmJ29sIVZv8WqcU2o2Htr3+G0WwW+c0WqAKR7Vooo2cvxwoq5QlH94VX9krnMb+09oJOQ==', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    connection_secret_ref = 'edge://6dd10cd4-5625-48f4-8431-23776bbd0795/peravaruni-ch8',
    ip_address = '172.29.91.100',
    vendor = 'cp-plus',
    model = 'CP PLUS DVR - Channel 8',
    channel = 8,
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-172.29.91.100',
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
  now(), now(), 'rtsp', 'verified', '6dd10cd4-5625-48f4-8431-23776bbd0795:camera:14d869da-4642-4d74-9de0-c4c6c2be4488:pera-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();

COMMIT;