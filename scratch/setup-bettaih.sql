BEGIN;

DELETE FROM camera_credentials WHERE branch_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND ip_address = '172.28.18.100' AND scope = 'host-specific';
INSERT INTO camera_credentials (branch_id, edge_agent_id, ip_address, username, password, scope)
VALUES ('d7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', '172.28.18.100', 'test', 'test@123', 'host-specific');


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', 'p6xWd/9C0L3LSjHrFx/sTtTNwlcLxuosr9mcy3C5KE3rMgxGHZe6e9bc2YBBoAAC9Ib3l08bus4qd0+u907CArmvpIhJXA8ZFgX41N71wQkmIUgDgCrtQCtNK/Vi4ldKi6Ao6w==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'PN9br8iutri3Oz692wE6IFEvUcr6SFEE3AmW5bbV5ONxBRpuGIgfVE24MGEcw5SQvK5B2r7IzijNVYFkHuDlUat6dzaErAciosINYPeajegjf79wr5jaaWKtZqvtXpekZ+HXgQ==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'E4IP3zwvT6MhlZp7guoW8503QmzuR207LJZM2oaFiWxicpJPD5iczFIRbTYQCDPpCYlnqCoV9TQpUWNxjydGgUxzJPNaXf+cTONnZgQIxMc61ArYIrceGgxheJF2oQdWgMI3lg==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


DO $$
DECLARE
  v_cam_id uuid;
  v_node_id uuid;
  v_identity_id uuid;
  v_ltree_id text;
BEGIN
  -- Check if camera exists for this channel
  SELECT id, resource_node_id, device_identity_id INTO v_cam_id, v_node_id, v_identity_id
  FROM cameras
  WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND ip_address = '172.28.18.100' AND recorder_channel = 1;

  IF v_cam_id IS NOT NULL THEN
    -- Update existing camera
    UPDATE cameras SET
      edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
      vendor = 'cp-plus',
      model = 'CP PLUS DVR - Channel 1',
      channel = 1,
      protocol = 'rtsp',
      status = 'online'::camera_status,
      profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
      capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
      connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1',
      connection_transport = 'edge-gateway',
      source_type = 'analog-dvr-channel',
      recorder_id = 'recorder-bettaih-172.28.18.100',
      recorder_channel = 1,
      last_seen_at = now()
    WHERE id = v_cam_id;

    IF v_node_id IS NOT NULL THEN
      UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 1', is_active = true WHERE id = v_node_id;
    END IF;

    IF v_identity_id IS NOT NULL THEN
      UPDATE device_identities SET
        credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1',
        edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
        manufacturer = 'cp-plus',
        model = 'CP PLUS DVR - Channel 1',
        channel = 1,
        device_type = 'analog-dvr-channel',
        last_seen_at = now()
      WHERE id = v_identity_id;
    END IF;
  ELSE
    -- Generate fresh IDs
    v_node_id := gen_random_uuid();
    v_ltree_id := replace(v_node_id::text, '-', '_');

    -- Insert resource node
    INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level)
    VALUES (v_node_id, '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'camera', 'CP PLUS DVR - Channel 1', ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.ca129fa9_8fc2_4b4f_9960_adbcf6deb6ed.d7b23dee_9814_48c9_8805_48b61b33e3a9' || '.' || v_ltree_id)::ltree, true, 'normal');

    -- Insert device identity
    INSERT INTO device_identities (
      tenant_id, branch_node_id, device_type, manufacturer, model,
      current_ip_address, channel, credential_ref, edge_agent_id, first_seen_at, last_seen_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'analog-dvr-channel', 'cp-plus', 'CP PLUS DVR - Channel 1',
      '172.28.18.100', 1, 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', now(), now()
    ) RETURNING id INTO v_identity_id;

    -- Insert camera
    INSERT INTO cameras (
      resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
      vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
      connection_secret_ref, connection_transport, ip_address, source_type,
      recorder_id, recorder_channel
    ) VALUES (
      v_node_id, 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', v_identity_id,
      'cp-plus', 'CP PLUS DVR - Channel 1', 1, 'rtsp', 'online'::camera_status, now(),
      '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb, '{"ptz":false,"audio":false,"events":true}'::jsonb,
      'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch1', 'edge-gateway', '172.28.18.100'::inet, 'analog-dvr-channel',
      'recorder-bettaih-172.28.18.100', 1
    ) RETURNING id INTO v_cam_id;

    -- Link camera_id in device_identities
    UPDATE device_identities SET camera_id = v_cam_id WHERE id = v_identity_id;
  END IF;
END $$;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', 'qtvzLExBU6PWGGZZkx2nc4jqz/D3CxZr24wN3IQykJFnyLkO9rgPUne+w6MyBfAr8z+ai466TTpxfgMrQptwT8+Ro4PR1omuBzXVuEpDT9FcUz26mcpqQ81hTDnlKqUcFI5/0w==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'i9J3eWeOt31QCOK5lu5DCTZc9bdA4K2B/b8nZs0HHUhf3bWfrkH648mzV4tPxb2ZTjUsAcTYigbE7OkJdV0JuQBkPLR6KP0ZEsL74Jd/4+xpDlf28+GgiHahMYUYlErp6wUP1w==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Xap9UXKATmxrxa4EI//fv/sEnJ2utRdtSzePfAuUJZr3cpFU9fCM65w7AZK240At9Zs6vnuVusj8hldr/BtAievE4XIjzRlW+tc5hu3pRjg5Lo8I7CYCqZo5bfkdbW4/ARmd8w==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


DO $$
DECLARE
  v_cam_id uuid;
  v_node_id uuid;
  v_identity_id uuid;
  v_ltree_id text;
BEGIN
  -- Check if camera exists for this channel
  SELECT id, resource_node_id, device_identity_id INTO v_cam_id, v_node_id, v_identity_id
  FROM cameras
  WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND ip_address = '172.28.18.100' AND recorder_channel = 2;

  IF v_cam_id IS NOT NULL THEN
    -- Update existing camera
    UPDATE cameras SET
      edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
      vendor = 'cp-plus',
      model = 'CP PLUS DVR - Channel 2',
      channel = 2,
      protocol = 'rtsp',
      status = 'online'::camera_status,
      profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
      capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
      connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2',
      connection_transport = 'edge-gateway',
      source_type = 'analog-dvr-channel',
      recorder_id = 'recorder-bettaih-172.28.18.100',
      recorder_channel = 2,
      last_seen_at = now()
    WHERE id = v_cam_id;

    IF v_node_id IS NOT NULL THEN
      UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 2', is_active = true WHERE id = v_node_id;
    END IF;

    IF v_identity_id IS NOT NULL THEN
      UPDATE device_identities SET
        credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2',
        edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
        manufacturer = 'cp-plus',
        model = 'CP PLUS DVR - Channel 2',
        channel = 2,
        device_type = 'analog-dvr-channel',
        last_seen_at = now()
      WHERE id = v_identity_id;
    END IF;
  ELSE
    -- Generate fresh IDs
    v_node_id := gen_random_uuid();
    v_ltree_id := replace(v_node_id::text, '-', '_');

    -- Insert resource node
    INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level)
    VALUES (v_node_id, '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'camera', 'CP PLUS DVR - Channel 2', ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.ca129fa9_8fc2_4b4f_9960_adbcf6deb6ed.d7b23dee_9814_48c9_8805_48b61b33e3a9' || '.' || v_ltree_id)::ltree, true, 'normal');

    -- Insert device identity
    INSERT INTO device_identities (
      tenant_id, branch_node_id, device_type, manufacturer, model,
      current_ip_address, channel, credential_ref, edge_agent_id, first_seen_at, last_seen_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'analog-dvr-channel', 'cp-plus', 'CP PLUS DVR - Channel 2',
      '172.28.18.100', 2, 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', now(), now()
    ) RETURNING id INTO v_identity_id;

    -- Insert camera
    INSERT INTO cameras (
      resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
      vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
      connection_secret_ref, connection_transport, ip_address, source_type,
      recorder_id, recorder_channel
    ) VALUES (
      v_node_id, 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', v_identity_id,
      'cp-plus', 'CP PLUS DVR - Channel 2', 2, 'rtsp', 'online'::camera_status, now(),
      '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb, '{"ptz":false,"audio":false,"events":true}'::jsonb,
      'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch2', 'edge-gateway', '172.28.18.100'::inet, 'analog-dvr-channel',
      'recorder-bettaih-172.28.18.100', 2
    ) RETURNING id INTO v_cam_id;

    -- Link camera_id in device_identities
    UPDATE device_identities SET camera_id = v_cam_id WHERE id = v_identity_id;
  END IF;
END $$;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', 'xEyMfhiLwjlsmMQKPzKzJf+vtJQcS6KzY83bQbmW3OK4Ne2fXU6cprgl97FnAY8k46OgNaM0BEJN207q7Yi5vcgsvINBsnNJLUDNXOh2diAXXUnKyTw+vQ0Jda7H154IEe/XEQ==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'z1ycE3GHCOpJYiL8UMyy4du3zHgNs9PFgTS7yMPLOstU9fwA2kAIK3vUeaB+P57b1ogmDzbkUg4Cc0B+0jJzRlEp3lV5B11cLJGf9qt4KYv/xoSIx0/DU6hIaJdz2wHSZieH6A==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'kzKkOTPgF3tRSDdC9A4ExA2RF3oSrSEOB/m9Fo83oLOsMN+lahScMc4L0XM1rROZYJ1q6QcaUVIP7om6etYfOP4Krd54Of1/Fcnh6sps39+H78/vlOzmofsowQNgwWVkBUsS/g==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


DO $$
DECLARE
  v_cam_id uuid;
  v_node_id uuid;
  v_identity_id uuid;
  v_ltree_id text;
BEGIN
  -- Check if camera exists for this channel
  SELECT id, resource_node_id, device_identity_id INTO v_cam_id, v_node_id, v_identity_id
  FROM cameras
  WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND ip_address = '172.28.18.100' AND recorder_channel = 3;

  IF v_cam_id IS NOT NULL THEN
    -- Update existing camera
    UPDATE cameras SET
      edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
      vendor = 'cp-plus',
      model = 'CP PLUS DVR - Channel 3',
      channel = 3,
      protocol = 'rtsp',
      status = 'online'::camera_status,
      profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
      capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
      connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3',
      connection_transport = 'edge-gateway',
      source_type = 'analog-dvr-channel',
      recorder_id = 'recorder-bettaih-172.28.18.100',
      recorder_channel = 3,
      last_seen_at = now()
    WHERE id = v_cam_id;

    IF v_node_id IS NOT NULL THEN
      UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 3', is_active = true WHERE id = v_node_id;
    END IF;

    IF v_identity_id IS NOT NULL THEN
      UPDATE device_identities SET
        credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3',
        edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
        manufacturer = 'cp-plus',
        model = 'CP PLUS DVR - Channel 3',
        channel = 3,
        device_type = 'analog-dvr-channel',
        last_seen_at = now()
      WHERE id = v_identity_id;
    END IF;
  ELSE
    -- Generate fresh IDs
    v_node_id := gen_random_uuid();
    v_ltree_id := replace(v_node_id::text, '-', '_');

    -- Insert resource node
    INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level)
    VALUES (v_node_id, '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'camera', 'CP PLUS DVR - Channel 3', ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.ca129fa9_8fc2_4b4f_9960_adbcf6deb6ed.d7b23dee_9814_48c9_8805_48b61b33e3a9' || '.' || v_ltree_id)::ltree, true, 'normal');

    -- Insert device identity
    INSERT INTO device_identities (
      tenant_id, branch_node_id, device_type, manufacturer, model,
      current_ip_address, channel, credential_ref, edge_agent_id, first_seen_at, last_seen_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'analog-dvr-channel', 'cp-plus', 'CP PLUS DVR - Channel 3',
      '172.28.18.100', 3, 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', now(), now()
    ) RETURNING id INTO v_identity_id;

    -- Insert camera
    INSERT INTO cameras (
      resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
      vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
      connection_secret_ref, connection_transport, ip_address, source_type,
      recorder_id, recorder_channel
    ) VALUES (
      v_node_id, 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', v_identity_id,
      'cp-plus', 'CP PLUS DVR - Channel 3', 3, 'rtsp', 'online'::camera_status, now(),
      '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb, '{"ptz":false,"audio":false,"events":true}'::jsonb,
      'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch3', 'edge-gateway', '172.28.18.100'::inet, 'analog-dvr-channel',
      'recorder-bettaih-172.28.18.100', 3
    ) RETURNING id INTO v_cam_id;

    -- Link camera_id in device_identities
    UPDATE device_identities SET camera_id = v_cam_id WHERE id = v_identity_id;
  END IF;
END $$;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', 'wM3ZfKPs9X9JV1Jg8wVb8bIz08aDLare31yWsHe4ydrVexT1wuwYH7ROMDrhYPY0hICSbf0QRID25+pO9rPPh4mM3fc2PI3ELb0XMUhCtGhtsRaY09zUq26wJGbdcRDzv9C76A==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'AjaQ9Q35m9duvn8PHd2039QhBAVrj4JbMzFKMK+HMGyeFowE/03iufVCPbViD8po/F0eDZAAfTJ8PCVtkxRwfe/p7v8iGllfCyD+yXdtwpyyjm5aGZveDP9JR5fulDuyc3l8ng==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'u0rhhqrKWjwi6LFWERHYTm0Hp+sK8yJLMLTxR6f1F8TKi49o0chSAGeubmv36Lmb59nzJ+F2zZ8p0j71OTEnEkflZf4ciDXmlICUH9F+BD/g71QAaBTXz4V0yanf9CibZ1SIMg==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


DO $$
DECLARE
  v_cam_id uuid;
  v_node_id uuid;
  v_identity_id uuid;
  v_ltree_id text;
BEGIN
  -- Check if camera exists for this channel
  SELECT id, resource_node_id, device_identity_id INTO v_cam_id, v_node_id, v_identity_id
  FROM cameras
  WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND ip_address = '172.28.18.100' AND recorder_channel = 4;

  IF v_cam_id IS NOT NULL THEN
    -- Update existing camera
    UPDATE cameras SET
      edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
      vendor = 'cp-plus',
      model = 'CP PLUS DVR - Channel 4',
      channel = 4,
      protocol = 'rtsp',
      status = 'online'::camera_status,
      profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
      capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
      connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4',
      connection_transport = 'edge-gateway',
      source_type = 'analog-dvr-channel',
      recorder_id = 'recorder-bettaih-172.28.18.100',
      recorder_channel = 4,
      last_seen_at = now()
    WHERE id = v_cam_id;

    IF v_node_id IS NOT NULL THEN
      UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 4', is_active = true WHERE id = v_node_id;
    END IF;

    IF v_identity_id IS NOT NULL THEN
      UPDATE device_identities SET
        credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4',
        edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
        manufacturer = 'cp-plus',
        model = 'CP PLUS DVR - Channel 4',
        channel = 4,
        device_type = 'analog-dvr-channel',
        last_seen_at = now()
      WHERE id = v_identity_id;
    END IF;
  ELSE
    -- Generate fresh IDs
    v_node_id := gen_random_uuid();
    v_ltree_id := replace(v_node_id::text, '-', '_');

    -- Insert resource node
    INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level)
    VALUES (v_node_id, '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'camera', 'CP PLUS DVR - Channel 4', ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.ca129fa9_8fc2_4b4f_9960_adbcf6deb6ed.d7b23dee_9814_48c9_8805_48b61b33e3a9' || '.' || v_ltree_id)::ltree, true, 'normal');

    -- Insert device identity
    INSERT INTO device_identities (
      tenant_id, branch_node_id, device_type, manufacturer, model,
      current_ip_address, channel, credential_ref, edge_agent_id, first_seen_at, last_seen_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'analog-dvr-channel', 'cp-plus', 'CP PLUS DVR - Channel 4',
      '172.28.18.100', 4, 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', now(), now()
    ) RETURNING id INTO v_identity_id;

    -- Insert camera
    INSERT INTO cameras (
      resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
      vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
      connection_secret_ref, connection_transport, ip_address, source_type,
      recorder_id, recorder_channel
    ) VALUES (
      v_node_id, 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', v_identity_id,
      'cp-plus', 'CP PLUS DVR - Channel 4', 4, 'rtsp', 'online'::camera_status, now(),
      '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb, '{"ptz":false,"audio":false,"events":true}'::jsonb,
      'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch4', 'edge-gateway', '172.28.18.100'::inet, 'analog-dvr-channel',
      'recorder-bettaih-172.28.18.100', 4
    ) RETURNING id INTO v_cam_id;

    -- Link camera_id in device_identities
    UPDATE device_identities SET camera_id = v_cam_id WHERE id = v_identity_id;
  END IF;
END $$;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', 'oE9+Sju9cW0ThYF+gxtU/1qQiQT7g+arEnSry1ImlNezBLD6rpF7LJV7NNT4R5zU2eEb6GLmNZiOlbtlKhihMcul2XukTXLDT67zrsBPFZpR3R2riArPMy2v4wMLOjtiXPzpGA==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'yxt8PaWZ8z68QJkTAny04uFsswbxRlCmBWK5tkjI216Giq/8tYLzNgso0dgsMsUj8svuVPcpsz1SNaqxpXaeCl/pYpkMPu7Gy1avZy41Jiv+g1WRJzyvDAxMZMmc03rDIEjj5A==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'jP1lIzZLaHfPDpymBiYWJ3n0k+BZNVxKyUnsL+RzJFMvwHr6MPHP2RRmlZht9ZZG/OsCNZ1hJhDdgA+KiC94TrHQYxAVfBbqzbZ9ZQlxM8pke0CBEYYzYwwjPEiLERMFhpeBjw==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


DO $$
DECLARE
  v_cam_id uuid;
  v_node_id uuid;
  v_identity_id uuid;
  v_ltree_id text;
BEGIN
  -- Check if camera exists for this channel
  SELECT id, resource_node_id, device_identity_id INTO v_cam_id, v_node_id, v_identity_id
  FROM cameras
  WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND ip_address = '172.28.18.100' AND recorder_channel = 5;

  IF v_cam_id IS NOT NULL THEN
    -- Update existing camera
    UPDATE cameras SET
      edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
      vendor = 'cp-plus',
      model = 'CP PLUS DVR - Channel 5',
      channel = 5,
      protocol = 'rtsp',
      status = 'online'::camera_status,
      profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
      capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
      connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5',
      connection_transport = 'edge-gateway',
      source_type = 'analog-dvr-channel',
      recorder_id = 'recorder-bettaih-172.28.18.100',
      recorder_channel = 5,
      last_seen_at = now()
    WHERE id = v_cam_id;

    IF v_node_id IS NOT NULL THEN
      UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 5', is_active = true WHERE id = v_node_id;
    END IF;

    IF v_identity_id IS NOT NULL THEN
      UPDATE device_identities SET
        credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5',
        edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
        manufacturer = 'cp-plus',
        model = 'CP PLUS DVR - Channel 5',
        channel = 5,
        device_type = 'analog-dvr-channel',
        last_seen_at = now()
      WHERE id = v_identity_id;
    END IF;
  ELSE
    -- Generate fresh IDs
    v_node_id := gen_random_uuid();
    v_ltree_id := replace(v_node_id::text, '-', '_');

    -- Insert resource node
    INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level)
    VALUES (v_node_id, '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'camera', 'CP PLUS DVR - Channel 5', ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.ca129fa9_8fc2_4b4f_9960_adbcf6deb6ed.d7b23dee_9814_48c9_8805_48b61b33e3a9' || '.' || v_ltree_id)::ltree, true, 'normal');

    -- Insert device identity
    INSERT INTO device_identities (
      tenant_id, branch_node_id, device_type, manufacturer, model,
      current_ip_address, channel, credential_ref, edge_agent_id, first_seen_at, last_seen_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'analog-dvr-channel', 'cp-plus', 'CP PLUS DVR - Channel 5',
      '172.28.18.100', 5, 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', now(), now()
    ) RETURNING id INTO v_identity_id;

    -- Insert camera
    INSERT INTO cameras (
      resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
      vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
      connection_secret_ref, connection_transport, ip_address, source_type,
      recorder_id, recorder_channel
    ) VALUES (
      v_node_id, 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', v_identity_id,
      'cp-plus', 'CP PLUS DVR - Channel 5', 5, 'rtsp', 'online'::camera_status, now(),
      '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb, '{"ptz":false,"audio":false,"events":true}'::jsonb,
      'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch5', 'edge-gateway', '172.28.18.100'::inet, 'analog-dvr-channel',
      'recorder-bettaih-172.28.18.100', 5
    ) RETURNING id INTO v_cam_id;

    -- Link camera_id in device_identities
    UPDATE device_identities SET camera_id = v_cam_id WHERE id = v_identity_id;
  END IF;
END $$;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', '7QFB2eRSTkC1uhej+Ft0yR+7mM8XYzZmL9Chx1yzRM4pPv8wCW6O52YmoKGlFkojZgrAOKY5aYLZ/LuYgp08OudJKIeyQW2Sx6/4Kh2uOUE518XKK4qIVXRuU0Jhne/I0lM7vw==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'NnFaC4EWM1D9vdsgHeoaL4Jxz9WLz79vged5Tf5IuVDz8nexyuqdzsCBM8x+6vMfayFUyGtEjBloW6DqZCm0Qpr5u0WXnTkES4AvTWQmA2XWZnTZ88OvBoCiM2z2k5sgdK3hGA==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '4OGampv7V465rJh47ipK9B5xLbmzi1LoV8oGNO2SZZmx2nGKF5WHqtByJFYvjC1LksV7U/qCE/wWt+WtpqN9Zr6oZz4Bxgr3sLRTg/C4OnJyg577opGmWSPcuqX33mUkX5AR5w==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


DO $$
DECLARE
  v_cam_id uuid;
  v_node_id uuid;
  v_identity_id uuid;
  v_ltree_id text;
BEGIN
  -- Check if camera exists for this channel
  SELECT id, resource_node_id, device_identity_id INTO v_cam_id, v_node_id, v_identity_id
  FROM cameras
  WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND ip_address = '172.28.18.100' AND recorder_channel = 6;

  IF v_cam_id IS NOT NULL THEN
    -- Update existing camera
    UPDATE cameras SET
      edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
      vendor = 'cp-plus',
      model = 'CP PLUS DVR - Channel 6',
      channel = 6,
      protocol = 'rtsp',
      status = 'online'::camera_status,
      profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
      capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
      connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6',
      connection_transport = 'edge-gateway',
      source_type = 'analog-dvr-channel',
      recorder_id = 'recorder-bettaih-172.28.18.100',
      recorder_channel = 6,
      last_seen_at = now()
    WHERE id = v_cam_id;

    IF v_node_id IS NOT NULL THEN
      UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 6', is_active = true WHERE id = v_node_id;
    END IF;

    IF v_identity_id IS NOT NULL THEN
      UPDATE device_identities SET
        credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6',
        edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
        manufacturer = 'cp-plus',
        model = 'CP PLUS DVR - Channel 6',
        channel = 6,
        device_type = 'analog-dvr-channel',
        last_seen_at = now()
      WHERE id = v_identity_id;
    END IF;
  ELSE
    -- Generate fresh IDs
    v_node_id := gen_random_uuid();
    v_ltree_id := replace(v_node_id::text, '-', '_');

    -- Insert resource node
    INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level)
    VALUES (v_node_id, '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'camera', 'CP PLUS DVR - Channel 6', ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.ca129fa9_8fc2_4b4f_9960_adbcf6deb6ed.d7b23dee_9814_48c9_8805_48b61b33e3a9' || '.' || v_ltree_id)::ltree, true, 'normal');

    -- Insert device identity
    INSERT INTO device_identities (
      tenant_id, branch_node_id, device_type, manufacturer, model,
      current_ip_address, channel, credential_ref, edge_agent_id, first_seen_at, last_seen_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'analog-dvr-channel', 'cp-plus', 'CP PLUS DVR - Channel 6',
      '172.28.18.100', 6, 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', now(), now()
    ) RETURNING id INTO v_identity_id;

    -- Insert camera
    INSERT INTO cameras (
      resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
      vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
      connection_secret_ref, connection_transport, ip_address, source_type,
      recorder_id, recorder_channel
    ) VALUES (
      v_node_id, 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', v_identity_id,
      'cp-plus', 'CP PLUS DVR - Channel 6', 6, 'rtsp', 'online'::camera_status, now(),
      '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb, '{"ptz":false,"audio":false,"events":true}'::jsonb,
      'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch6', 'edge-gateway', '172.28.18.100'::inet, 'analog-dvr-channel',
      'recorder-bettaih-172.28.18.100', 6
    ) RETURNING id INTO v_cam_id;

    -- Link camera_id in device_identities
    UPDATE device_identities SET camera_id = v_cam_id WHERE id = v_identity_id;
  END IF;
END $$;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', 'uqs6B7XA09XwGgNR8g8SNGKjj7qtWs1epyqhHJ+Snz2+Snszf5R/SNIpe4iT8gmIDHec/8rYveLXcxxN8+xxl7bm1XXAVX0MmtpbtdY/jvzqxRP4HBfTxEpY0BqgIb0nAgEQsw==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'U/BDHxIj7zMBT8x08yLrf4CPrpinWbAxTbWYf5utpNhqcSltSUw3O0A75yynO7olcbyMJLoZyJNKCajPgRcutpEJGWWOEpQ9/CVbFv8sbJPprVsXp4aa/uFr/hcy7Y3KMvincg==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'qxyMKZafobI8ZDfBkOQPs7guLS0Iq7WaXG1AycMHvBlH+QXTWgU0dTao0IyjCM2P8yS5929z+6hhdmeofzYG9PE96rbyUFz5lRl1j3GcqXgHhugzoAyA/J8ZCH89CdKSN3e7qQ==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


DO $$
DECLARE
  v_cam_id uuid;
  v_node_id uuid;
  v_identity_id uuid;
  v_ltree_id text;
BEGIN
  -- Check if camera exists for this channel
  SELECT id, resource_node_id, device_identity_id INTO v_cam_id, v_node_id, v_identity_id
  FROM cameras
  WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND ip_address = '172.28.18.100' AND recorder_channel = 7;

  IF v_cam_id IS NOT NULL THEN
    -- Update existing camera
    UPDATE cameras SET
      edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
      vendor = 'cp-plus',
      model = 'CP PLUS DVR - Channel 7',
      channel = 7,
      protocol = 'rtsp',
      status = 'online'::camera_status,
      profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
      capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
      connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7',
      connection_transport = 'edge-gateway',
      source_type = 'analog-dvr-channel',
      recorder_id = 'recorder-bettaih-172.28.18.100',
      recorder_channel = 7,
      last_seen_at = now()
    WHERE id = v_cam_id;

    IF v_node_id IS NOT NULL THEN
      UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 7', is_active = true WHERE id = v_node_id;
    END IF;

    IF v_identity_id IS NOT NULL THEN
      UPDATE device_identities SET
        credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7',
        edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
        manufacturer = 'cp-plus',
        model = 'CP PLUS DVR - Channel 7',
        channel = 7,
        device_type = 'analog-dvr-channel',
        last_seen_at = now()
      WHERE id = v_identity_id;
    END IF;
  ELSE
    -- Generate fresh IDs
    v_node_id := gen_random_uuid();
    v_ltree_id := replace(v_node_id::text, '-', '_');

    -- Insert resource node
    INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level)
    VALUES (v_node_id, '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'camera', 'CP PLUS DVR - Channel 7', ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.ca129fa9_8fc2_4b4f_9960_adbcf6deb6ed.d7b23dee_9814_48c9_8805_48b61b33e3a9' || '.' || v_ltree_id)::ltree, true, 'normal');

    -- Insert device identity
    INSERT INTO device_identities (
      tenant_id, branch_node_id, device_type, manufacturer, model,
      current_ip_address, channel, credential_ref, edge_agent_id, first_seen_at, last_seen_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'analog-dvr-channel', 'cp-plus', 'CP PLUS DVR - Channel 7',
      '172.28.18.100', 7, 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', now(), now()
    ) RETURNING id INTO v_identity_id;

    -- Insert camera
    INSERT INTO cameras (
      resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
      vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
      connection_secret_ref, connection_transport, ip_address, source_type,
      recorder_id, recorder_channel
    ) VALUES (
      v_node_id, 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', v_identity_id,
      'cp-plus', 'CP PLUS DVR - Channel 7', 7, 'rtsp', 'online'::camera_status, now(),
      '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb, '{"ptz":false,"audio":false,"events":true}'::jsonb,
      'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch7', 'edge-gateway', '172.28.18.100'::inet, 'analog-dvr-channel',
      'recorder-bettaih-172.28.18.100', 7
    ) RETURNING id INTO v_cam_id;

    -- Link camera_id in device_identities
    UPDATE device_identities SET camera_id = v_cam_id WHERE id = v_identity_id;
  END IF;
END $$;


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', 'nqGMNwo2isvZ/M4VXeWUBIdEVItnpqWioI0UT4iT1kDJQyeTv1Kh/ZlZ8uGbidGboUhZWQQl46cV8+sqUGT2fqjxe1HoBnyAD4L9Opb85VuMo2uMCM8mJaSKDGu5egnB/MAMVg==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'zQK8vwyUDo31jP5ksl+9yLRRrH8dyaRE7ydTld3rmOYurrlRFpX6eO438C5VeH5bBn0XeyLBEokqWenwNgXz2R2GxS6fLPnWECTwPQbyxAfEKNPTjiwFkHD/Q0/fIg0K57E/XQ==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '2j3UWZD+l94Ps4H2jsbNy11GHUXg9XMA4OIezf6SC3ENAGWHP2hDVP21nNfPYXr7kWV5PP9G1jMMV5nqRpvaL9YTZhK813d05bAWA8qtVGw7AyhU76A+20TAXW7RlzF0nmv7vw==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/dvr-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', 'NEVvAy60N2CgfSy/e3DVACgnDfhWW6A5VTBk1sJW83FfEXTC46BL4xM4Trqwo19i5ChBoWaEhYKvOguwRxrecbYq1Uusx0NLT1j5tqXWgNgbn/f0E6/ofE8gqA92kpObZ9oBJQ==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/DVR-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', 'fToZie3AZrT9w7ArvKtEJqROGYEj4cUbB5+OyIgdrLqlDpyIqDG8wZmWilVGEmPBXWtluDjnrWaZnTF8ltQQXb4Tw6GIwN30X2dQbzLGwRnqXRTpNyuis9GqiOmYXyp0XdhCTg==', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();


DO $$
DECLARE
  v_cam_id uuid;
  v_node_id uuid;
  v_identity_id uuid;
  v_ltree_id text;
BEGIN
  -- Check if camera exists for this channel
  SELECT id, resource_node_id, device_identity_id INTO v_cam_id, v_node_id, v_identity_id
  FROM cameras
  WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND ip_address = '172.28.18.100' AND recorder_channel = 8;

  IF v_cam_id IS NOT NULL THEN
    -- Update existing camera
    UPDATE cameras SET
      edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
      vendor = 'cp-plus',
      model = 'CP PLUS DVR - Channel 8',
      channel = 8,
      protocol = 'rtsp',
      status = 'online'::camera_status,
      profiles = '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
      capabilities = '{"ptz":false,"audio":false,"events":true}'::jsonb,
      connection_secret_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8',
      connection_transport = 'edge-gateway',
      source_type = 'analog-dvr-channel',
      recorder_id = 'recorder-bettaih-172.28.18.100',
      recorder_channel = 8,
      last_seen_at = now()
    WHERE id = v_cam_id;

    IF v_node_id IS NOT NULL THEN
      UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 8', is_active = true WHERE id = v_node_id;
    END IF;

    IF v_identity_id IS NOT NULL THEN
      UPDATE device_identities SET
        credential_ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8',
        edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
        manufacturer = 'cp-plus',
        model = 'CP PLUS DVR - Channel 8',
        channel = 8,
        device_type = 'analog-dvr-channel',
        last_seen_at = now()
      WHERE id = v_identity_id;
    END IF;
  ELSE
    -- Generate fresh IDs
    v_node_id := gen_random_uuid();
    v_ltree_id := replace(v_node_id::text, '-', '_');

    -- Insert resource node
    INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level)
    VALUES (v_node_id, '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'camera', 'CP PLUS DVR - Channel 8', ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.ca129fa9_8fc2_4b4f_9960_adbcf6deb6ed.d7b23dee_9814_48c9_8805_48b61b33e3a9' || '.' || v_ltree_id)::ltree, true, 'normal');

    -- Insert device identity
    INSERT INTO device_identities (
      tenant_id, branch_node_id, device_type, manufacturer, model,
      current_ip_address, channel, credential_ref, edge_agent_id, first_seen_at, last_seen_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000001', 'd7b23dee-9814-48c9-8805-48b61b33e3a9', 'analog-dvr-channel', 'cp-plus', 'CP PLUS DVR - Channel 8',
      '172.28.18.100', 8, 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', now(), now()
    ) RETURNING id INTO v_identity_id;

    -- Insert camera
    INSERT INTO cameras (
      resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
      vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
      connection_secret_ref, connection_transport, ip_address, source_type,
      recorder_id, recorder_channel
    ) VALUES (
      v_node_id, 'd7b23dee-9814-48c9-8805-48b61b33e3a9', '9f108498-4dd5-4a21-b810-eec9e538953c', v_identity_id,
      'cp-plus', 'CP PLUS DVR - Channel 8', 8, 'rtsp', 'online'::camera_status, now(),
      '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb, '{"ptz":false,"audio":false,"events":true}'::jsonb,
      'edge://9f108498-4dd5-4a21-b810-eec9e538953c/bettaih-ch8', 'edge-gateway', '172.28.18.100'::inet, 'analog-dvr-channel',
      'recorder-bettaih-172.28.18.100', 8
    ) RETURNING id INTO v_cam_id;

    -- Link camera_id in device_identities
    UPDATE device_identities SET camera_id = v_cam_id WHERE id = v_identity_id;
  END IF;
END $$;


DELETE FROM live_sessions WHERE camera_id IN (
  SELECT id FROM cameras WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND ip_address = '172.28.18.100' AND recorder_channel IS NULL
);
DELETE FROM cameras WHERE branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9' AND ip_address = '172.28.18.100' AND recorder_channel IS NULL;

COMMIT;