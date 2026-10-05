
BEGIN;

-- 2.1 Ensure Rajkot exists in branches table
INSERT INTO branches (id, tenant_id, name, status, metadata, created_at, updated_at)
VALUES (
  '6ddee070-9050-4f55-aaa1-1190654bbc6b',
  '00000000-0000-4000-8000-000000000001',
  'Rajkot',
  'ACTIVE',
  '{"source": "resource_nodes"}'::jsonb,
  now(),
  now()
) ON CONFLICT (id) DO UPDATE 
SET name = 'Rajkot', status = 'ACTIVE', updated_at = now();

-- 2.2 Clean any previous records for 172.28.36.100 in Rajkot if any
DELETE FROM live_sessions WHERE camera_id IN (SELECT id FROM cameras WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND ip_address = '172.28.36.100');
DELETE FROM cameras WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND ip_address = '172.28.36.100';
DELETE FROM device_identities WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND current_ip_address = '172.28.36.100';
DELETE FROM resource_nodes WHERE parent_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND name LIKE 'Rajkot - Channel %';

-- 2.3 Ensure camera_credentials record
DELETE FROM camera_credentials WHERE branch_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' AND ip_address = '172.28.36.100';
INSERT INTO camera_credentials (branch_id, edge_agent_id, ip_address, username, password, scope)
VALUES ('6ddee070-9050-4f55-aaa1-1190654bbc6b', '9f108498-4dd5-4a21-b810-eec9e538953c', '172.28.36.100', 'test', 'test@123', 'host-specific');

-- Channel 1
DO $$
DECLARE
  v_node_id uuid := gen_random_uuid();
  v_identity_id uuid := gen_random_uuid();
  v_camera_id uuid := gen_random_uuid();
  v_ltree_id text;
BEGIN
  v_ltree_id := replace(v_node_id::text, '-', '_');

  -- Resource Node
  INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level, created_at, updated_at)
  VALUES (
    v_node_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'camera',
    'Rajkot - Channel 1',
    ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.db6a3d17_5811_492c_93c7_0eb37e7c0e90.6ddee070_9050_4f55_aaa1_1190654bbc6b' || '.' || v_ltree_id)::ltree,
    true,
    'normal',
    now(),
    now()
  );

  -- Device Identity
  INSERT INTO device_identities (
    id, tenant_id, branch_node_id, device_type, manufacturer, model,
    current_ip_address, channel, credential_ref, edge_agent_id,
    first_seen_at, last_seen_at, created_at, updated_at
  ) VALUES (
    v_identity_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'analog-dvr-channel',
    'CP PLUS',
    'CP PLUS DVR - Channel 1',
    '172.28.36.100',
    1,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    now(),
    now(),
    now(),
    now()
  );

  -- Camera
  INSERT INTO cameras (
    id, resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
    vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
    connection_secret_ref, connection_transport, ip_address, source_type,
    recorder_id, recorder_channel, sensitivity_level, first_seen_at, created_at
  ) VALUES (
    v_camera_id,
    v_node_id,
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    v_identity_id,
    'cp-plus',
    'CP PLUS DVR - Channel 1',
    1,
    'rtsp',
    'online'::camera_status,
    now(),
    '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    '{"ptz":false,"audio":false,"events":true}'::jsonb,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1',
    'edge-gateway',
    '172.28.36.100'::inet,
    'analog-dvr-channel',
    'recorder-rajkot-172-28-36-100',
    1,
    'internal',
    now(),
    now()
  );

  -- Update camera_id on device_identities
  UPDATE device_identities SET camera_id = v_camera_id WHERE id = v_identity_id;

END $$;

-- Channel 2
DO $$
DECLARE
  v_node_id uuid := gen_random_uuid();
  v_identity_id uuid := gen_random_uuid();
  v_camera_id uuid := gen_random_uuid();
  v_ltree_id text;
BEGIN
  v_ltree_id := replace(v_node_id::text, '-', '_');

  -- Resource Node
  INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level, created_at, updated_at)
  VALUES (
    v_node_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'camera',
    'Rajkot - Channel 2',
    ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.db6a3d17_5811_492c_93c7_0eb37e7c0e90.6ddee070_9050_4f55_aaa1_1190654bbc6b' || '.' || v_ltree_id)::ltree,
    true,
    'normal',
    now(),
    now()
  );

  -- Device Identity
  INSERT INTO device_identities (
    id, tenant_id, branch_node_id, device_type, manufacturer, model,
    current_ip_address, channel, credential_ref, edge_agent_id,
    first_seen_at, last_seen_at, created_at, updated_at
  ) VALUES (
    v_identity_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'analog-dvr-channel',
    'CP PLUS',
    'CP PLUS DVR - Channel 2',
    '172.28.36.100',
    2,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    now(),
    now(),
    now(),
    now()
  );

  -- Camera
  INSERT INTO cameras (
    id, resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
    vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
    connection_secret_ref, connection_transport, ip_address, source_type,
    recorder_id, recorder_channel, sensitivity_level, first_seen_at, created_at
  ) VALUES (
    v_camera_id,
    v_node_id,
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    v_identity_id,
    'cp-plus',
    'CP PLUS DVR - Channel 2',
    2,
    'rtsp',
    'online'::camera_status,
    now(),
    '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    '{"ptz":false,"audio":false,"events":true}'::jsonb,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2',
    'edge-gateway',
    '172.28.36.100'::inet,
    'analog-dvr-channel',
    'recorder-rajkot-172-28-36-100',
    2,
    'internal',
    now(),
    now()
  );

  -- Update camera_id on device_identities
  UPDATE device_identities SET camera_id = v_camera_id WHERE id = v_identity_id;

END $$;

-- Channel 3
DO $$
DECLARE
  v_node_id uuid := gen_random_uuid();
  v_identity_id uuid := gen_random_uuid();
  v_camera_id uuid := gen_random_uuid();
  v_ltree_id text;
BEGIN
  v_ltree_id := replace(v_node_id::text, '-', '_');

  -- Resource Node
  INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level, created_at, updated_at)
  VALUES (
    v_node_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'camera',
    'Rajkot - Channel 3',
    ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.db6a3d17_5811_492c_93c7_0eb37e7c0e90.6ddee070_9050_4f55_aaa1_1190654bbc6b' || '.' || v_ltree_id)::ltree,
    true,
    'normal',
    now(),
    now()
  );

  -- Device Identity
  INSERT INTO device_identities (
    id, tenant_id, branch_node_id, device_type, manufacturer, model,
    current_ip_address, channel, credential_ref, edge_agent_id,
    first_seen_at, last_seen_at, created_at, updated_at
  ) VALUES (
    v_identity_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'analog-dvr-channel',
    'CP PLUS',
    'CP PLUS DVR - Channel 3',
    '172.28.36.100',
    3,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    now(),
    now(),
    now(),
    now()
  );

  -- Camera
  INSERT INTO cameras (
    id, resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
    vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
    connection_secret_ref, connection_transport, ip_address, source_type,
    recorder_id, recorder_channel, sensitivity_level, first_seen_at, created_at
  ) VALUES (
    v_camera_id,
    v_node_id,
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    v_identity_id,
    'cp-plus',
    'CP PLUS DVR - Channel 3',
    3,
    'rtsp',
    'online'::camera_status,
    now(),
    '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    '{"ptz":false,"audio":false,"events":true}'::jsonb,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3',
    'edge-gateway',
    '172.28.36.100'::inet,
    'analog-dvr-channel',
    'recorder-rajkot-172-28-36-100',
    3,
    'internal',
    now(),
    now()
  );

  -- Update camera_id on device_identities
  UPDATE device_identities SET camera_id = v_camera_id WHERE id = v_identity_id;

END $$;

-- Channel 4
DO $$
DECLARE
  v_node_id uuid := gen_random_uuid();
  v_identity_id uuid := gen_random_uuid();
  v_camera_id uuid := gen_random_uuid();
  v_ltree_id text;
BEGIN
  v_ltree_id := replace(v_node_id::text, '-', '_');

  -- Resource Node
  INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level, created_at, updated_at)
  VALUES (
    v_node_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'camera',
    'Rajkot - Channel 4',
    ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.db6a3d17_5811_492c_93c7_0eb37e7c0e90.6ddee070_9050_4f55_aaa1_1190654bbc6b' || '.' || v_ltree_id)::ltree,
    true,
    'normal',
    now(),
    now()
  );

  -- Device Identity
  INSERT INTO device_identities (
    id, tenant_id, branch_node_id, device_type, manufacturer, model,
    current_ip_address, channel, credential_ref, edge_agent_id,
    first_seen_at, last_seen_at, created_at, updated_at
  ) VALUES (
    v_identity_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'analog-dvr-channel',
    'CP PLUS',
    'CP PLUS DVR - Channel 4',
    '172.28.36.100',
    4,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    now(),
    now(),
    now(),
    now()
  );

  -- Camera
  INSERT INTO cameras (
    id, resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
    vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
    connection_secret_ref, connection_transport, ip_address, source_type,
    recorder_id, recorder_channel, sensitivity_level, first_seen_at, created_at
  ) VALUES (
    v_camera_id,
    v_node_id,
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    v_identity_id,
    'cp-plus',
    'CP PLUS DVR - Channel 4',
    4,
    'rtsp',
    'online'::camera_status,
    now(),
    '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    '{"ptz":false,"audio":false,"events":true}'::jsonb,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4',
    'edge-gateway',
    '172.28.36.100'::inet,
    'analog-dvr-channel',
    'recorder-rajkot-172-28-36-100',
    4,
    'internal',
    now(),
    now()
  );

  -- Update camera_id on device_identities
  UPDATE device_identities SET camera_id = v_camera_id WHERE id = v_identity_id;

END $$;

-- Channel 5
DO $$
DECLARE
  v_node_id uuid := gen_random_uuid();
  v_identity_id uuid := gen_random_uuid();
  v_camera_id uuid := gen_random_uuid();
  v_ltree_id text;
BEGIN
  v_ltree_id := replace(v_node_id::text, '-', '_');

  -- Resource Node
  INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level, created_at, updated_at)
  VALUES (
    v_node_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'camera',
    'Rajkot - Channel 5',
    ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.db6a3d17_5811_492c_93c7_0eb37e7c0e90.6ddee070_9050_4f55_aaa1_1190654bbc6b' || '.' || v_ltree_id)::ltree,
    true,
    'normal',
    now(),
    now()
  );

  -- Device Identity
  INSERT INTO device_identities (
    id, tenant_id, branch_node_id, device_type, manufacturer, model,
    current_ip_address, channel, credential_ref, edge_agent_id,
    first_seen_at, last_seen_at, created_at, updated_at
  ) VALUES (
    v_identity_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'analog-dvr-channel',
    'CP PLUS',
    'CP PLUS DVR - Channel 5',
    '172.28.36.100',
    5,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    now(),
    now(),
    now(),
    now()
  );

  -- Camera
  INSERT INTO cameras (
    id, resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
    vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
    connection_secret_ref, connection_transport, ip_address, source_type,
    recorder_id, recorder_channel, sensitivity_level, first_seen_at, created_at
  ) VALUES (
    v_camera_id,
    v_node_id,
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    v_identity_id,
    'cp-plus',
    'CP PLUS DVR - Channel 5',
    5,
    'rtsp',
    'online'::camera_status,
    now(),
    '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    '{"ptz":false,"audio":false,"events":true}'::jsonb,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5',
    'edge-gateway',
    '172.28.36.100'::inet,
    'analog-dvr-channel',
    'recorder-rajkot-172-28-36-100',
    5,
    'internal',
    now(),
    now()
  );

  -- Update camera_id on device_identities
  UPDATE device_identities SET camera_id = v_camera_id WHERE id = v_identity_id;

END $$;

-- Channel 6
DO $$
DECLARE
  v_node_id uuid := gen_random_uuid();
  v_identity_id uuid := gen_random_uuid();
  v_camera_id uuid := gen_random_uuid();
  v_ltree_id text;
BEGIN
  v_ltree_id := replace(v_node_id::text, '-', '_');

  -- Resource Node
  INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level, created_at, updated_at)
  VALUES (
    v_node_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'camera',
    'Rajkot - Channel 6',
    ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.db6a3d17_5811_492c_93c7_0eb37e7c0e90.6ddee070_9050_4f55_aaa1_1190654bbc6b' || '.' || v_ltree_id)::ltree,
    true,
    'normal',
    now(),
    now()
  );

  -- Device Identity
  INSERT INTO device_identities (
    id, tenant_id, branch_node_id, device_type, manufacturer, model,
    current_ip_address, channel, credential_ref, edge_agent_id,
    first_seen_at, last_seen_at, created_at, updated_at
  ) VALUES (
    v_identity_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'analog-dvr-channel',
    'CP PLUS',
    'CP PLUS DVR - Channel 6',
    '172.28.36.100',
    6,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    now(),
    now(),
    now(),
    now()
  );

  -- Camera
  INSERT INTO cameras (
    id, resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
    vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
    connection_secret_ref, connection_transport, ip_address, source_type,
    recorder_id, recorder_channel, sensitivity_level, first_seen_at, created_at
  ) VALUES (
    v_camera_id,
    v_node_id,
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    v_identity_id,
    'cp-plus',
    'CP PLUS DVR - Channel 6',
    6,
    'rtsp',
    'online'::camera_status,
    now(),
    '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    '{"ptz":false,"audio":false,"events":true}'::jsonb,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6',
    'edge-gateway',
    '172.28.36.100'::inet,
    'analog-dvr-channel',
    'recorder-rajkot-172-28-36-100',
    6,
    'internal',
    now(),
    now()
  );

  -- Update camera_id on device_identities
  UPDATE device_identities SET camera_id = v_camera_id WHERE id = v_identity_id;

END $$;

-- Channel 7
DO $$
DECLARE
  v_node_id uuid := gen_random_uuid();
  v_identity_id uuid := gen_random_uuid();
  v_camera_id uuid := gen_random_uuid();
  v_ltree_id text;
BEGIN
  v_ltree_id := replace(v_node_id::text, '-', '_');

  -- Resource Node
  INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level, created_at, updated_at)
  VALUES (
    v_node_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'camera',
    'Rajkot - Channel 7',
    ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.db6a3d17_5811_492c_93c7_0eb37e7c0e90.6ddee070_9050_4f55_aaa1_1190654bbc6b' || '.' || v_ltree_id)::ltree,
    true,
    'normal',
    now(),
    now()
  );

  -- Device Identity
  INSERT INTO device_identities (
    id, tenant_id, branch_node_id, device_type, manufacturer, model,
    current_ip_address, channel, credential_ref, edge_agent_id,
    first_seen_at, last_seen_at, created_at, updated_at
  ) VALUES (
    v_identity_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'analog-dvr-channel',
    'CP PLUS',
    'CP PLUS DVR - Channel 7',
    '172.28.36.100',
    7,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    now(),
    now(),
    now(),
    now()
  );

  -- Camera
  INSERT INTO cameras (
    id, resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
    vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
    connection_secret_ref, connection_transport, ip_address, source_type,
    recorder_id, recorder_channel, sensitivity_level, first_seen_at, created_at
  ) VALUES (
    v_camera_id,
    v_node_id,
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    v_identity_id,
    'cp-plus',
    'CP PLUS DVR - Channel 7',
    7,
    'rtsp',
    'online'::camera_status,
    now(),
    '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    '{"ptz":false,"audio":false,"events":true}'::jsonb,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7',
    'edge-gateway',
    '172.28.36.100'::inet,
    'analog-dvr-channel',
    'recorder-rajkot-172-28-36-100',
    7,
    'internal',
    now(),
    now()
  );

  -- Update camera_id on device_identities
  UPDATE device_identities SET camera_id = v_camera_id WHERE id = v_identity_id;

END $$;

-- Channel 8
DO $$
DECLARE
  v_node_id uuid := gen_random_uuid();
  v_identity_id uuid := gen_random_uuid();
  v_camera_id uuid := gen_random_uuid();
  v_ltree_id text;
BEGIN
  v_ltree_id := replace(v_node_id::text, '-', '_');

  -- Resource Node
  INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level, created_at, updated_at)
  VALUES (
    v_node_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'camera',
    'Rajkot - Channel 8',
    ('a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.db6a3d17_5811_492c_93c7_0eb37e7c0e90.6ddee070_9050_4f55_aaa1_1190654bbc6b' || '.' || v_ltree_id)::ltree,
    true,
    'normal',
    now(),
    now()
  );

  -- Device Identity
  INSERT INTO device_identities (
    id, tenant_id, branch_node_id, device_type, manufacturer, model,
    current_ip_address, channel, credential_ref, edge_agent_id,
    first_seen_at, last_seen_at, created_at, updated_at
  ) VALUES (
    v_identity_id,
    '00000000-0000-4000-8000-000000000001',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    'analog-dvr-channel',
    'CP PLUS',
    'CP PLUS DVR - Channel 8',
    '172.28.36.100',
    8,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    now(),
    now(),
    now(),
    now()
  );

  -- Camera
  INSERT INTO cameras (
    id, resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
    vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
    connection_secret_ref, connection_transport, ip_address, source_type,
    recorder_id, recorder_channel, sensitivity_level, first_seen_at, created_at
  ) VALUES (
    v_camera_id,
    v_node_id,
    '6ddee070-9050-4f55-aaa1-1190654bbc6b',
    '9f108498-4dd5-4a21-b810-eec9e538953c',
    v_identity_id,
    'cp-plus',
    'CP PLUS DVR - Channel 8',
    8,
    'rtsp',
    'online'::camera_status,
    now(),
    '[{"name":"main","role":"main","codec":"H264","width":1920,"height":1080},{"name":"sub","role":"sub","codec":"H264","width":640,"height":360,"preferredFor":["live","analytics"]}]'::jsonb,
    '{"ptz":false,"audio":false,"events":true}'::jsonb,
    'edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8',
    'edge-gateway',
    '172.28.36.100'::inet,
    'analog-dvr-channel',
    'recorder-rajkot-172-28-36-100',
    8,
    'internal',
    now(),
    now()
  );

  -- Update camera_id on device_identities
  UPDATE device_identities SET camera_id = v_camera_id WHERE id = v_identity_id;

END $$;

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1', '9f108498-4dd5-4a21-b810-eec9e538953c', '9HsneUTxjm7J2vFD1BcWTAUijR2B9YPVSqAlJfxb8exGPL8H2c8v05CEaICavnekgZPOIxUvXgeihf0wUevuLnOj9y0mxYgXjIj+kRgMN3i0dF4mbUvNz2BqC1/tr/cPUKDmlw==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'JMcH7/9mN1V8shBNG2e0nYSuFyxe5S9Wen2Yb5/soCQpm0P/yfF09n8Oah83qhmeVgsUQvFEQFl+l7GGSalF5khqU4vzt9qNtLor3NBhaxngNO06r4ilxLngXtvOULr6sPFZtA==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch1#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'zQvGmJglZud+RRCgqIs9vnb9HY0zQasnqFe872r6v7Igu4d1v5qbkLylCEWG6m7jl8+5meoLCEPn9uBzoCG62sPy4RwMeGqzBFywuAfNt45SOCD8gzsVohD5kuhfVE4QA8vfSA==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2', '9f108498-4dd5-4a21-b810-eec9e538953c', '8BeVYgdiFkKGWDy3xiFW+7mp1YtiYMqS2Uk3znpyTYIUlrG8eYBkM9f7PdddPE1upohke5ycHF+z+qMJvn9toga5W4dmtHUsVDT/Vnrnsdf03q84nqdWjBta5J7axWahOZvEkw==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'aiKBIo8KPj52ox1cUkvZ2Nv0AcqkeqUlRZLBdCPsf8ri7qGojhDDv1RsY2lzrAhJJDJKnLa/M0teVWWGlRhtW2lPhYT2wAckB8xDBWVb4+uFqki4wlFqwY+sRlBWV864JCxg8A==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch2#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'XSVvpwiymL44OX2SBvNbCm3DHFzBPGRdsD7qCBr8npk4UrAezFq3qf3SkzAXzYAQIHgKDopY0+Fp3MlxzceHenQykCrt+SRJCL7r/NGrL3Ctqn0/NFiwMqWo2UQjHKC8PvUppg==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3', '9f108498-4dd5-4a21-b810-eec9e538953c', 'LniwKmZrJ73PZSVoMZNiSQoBGeArDvkXy8+QTSiy5mJU+4kICKxm+qMbWOEa8IOg6GHXIQVpAlxgdbw0Fny4Jy5Xym2MergGaBZo5KOhn6w27hoPEe47v+YlHfdVTq7oKfkFVw==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'N8GQiV8zsCyKSkTutOHjdVqInuD0u46fexT0I1EsU+VL/E45GLUIS53bpNqZPu3iuvl1sHYLBWDYj2KgA6JfzEHR8/hhJTY5a4uV3Ybj/i7Mkwsg05+6IqYzenb/h7+u05/arg==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch3#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'QEIhMuLklNzrynfjTG9PGNQqLI5u73NC2iLQe/Imw0fxC+rt1toi79hPN4OZU5ze2f7A6t1CTzDvAcMAPAZQKE9aJ3Eudr7sl4HitzB5DI0qmvyamysbbx3j56zPj7FGm7Avbw==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4', '9f108498-4dd5-4a21-b810-eec9e538953c', 'oUTEFd9X2Tw3i4fTHo+Ghsaac28D7j1WN1WamA9ZFEoS/ed6XZPQP828BcMeXsVnMGS3/8eRMG1osA7nITO/+erV1OD4lbUTrfUk43Sx1Qa9ObSs/b3hkb3047K1QAcWjvYCpQ==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', '+Uguwc9OhXfSvGZkWeeUX8gMYaIqdttgXLqUHVianvVkGCtsKp5/MQnfPy5FJL5AdGW+LEMUhdi/Mhvd1nBEVjnexU5kiezU/v7gCNBvgySkwsaKXVP+o3XJPrFpv9dzYMNEcw==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch4#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'BlBRADOtwvADu5oEhuFweunHshO06GGpZOU05hrfoeU9OyXKweTZ3tUt/sqvWpj+zfOOn0Whn8wkvRwJOLjpZPKbrajLfsr5UsKt6yimJ+tcjCmf5S0Efsf9zsaKu7fcQDJxfw==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5', '9f108498-4dd5-4a21-b810-eec9e538953c', '/p52THiR3ahJThHW2vWj0hHim2uxa3F7RnZzCLWtBpKO9it+WfBupKZGtsV0TLWaAWnCNT3JpipePgXVNYsZMyb1QTKgPul+4hnv6o40ulcG7RCcbgse832qZwbbUUJ4O2ONcA==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'cW1IFx4LOKdH67a02udwpYCNXOoKsUBDOv+FKqyigwZMKCJ2PDsdeyFAvQzKBvacGQuGw2iW7hx3Q4n08JcxjRwPYcHlcwuzfVhSujpUGGMgFeaTPx9kdUQsMS/YdA73IlORyQ==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch5#main', '9f108498-4dd5-4a21-b810-eec9e538953c', '6HGz4maLA45lB26W608xME5+NSnoisMWhqYoazl94s1A5B6kZQ68bpSPABwmXX4E0RVgR03u66ieUub4DxAKIb8fGGevPeLNb4OlkgQ0tlNgEPrPylWEOQhcPX0bFm+Boa1m0w==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6', '9f108498-4dd5-4a21-b810-eec9e538953c', '0RArIl8twQoHkqxr9uJdxv3gSy4NTM9sqCPuArIVzlssGUKFUJmsLpYjBSgGZSZmxdXXnI0NLGN2gx8ANhxm5aHfA88/rv8h4U03tdTJNqr/zffXNqlGN+SrmFy7WvAdVbF5iQ==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'i+bEk7iyoMK42Q7qwWSyAScWhh+29tFpcq0vdA1ZPL9Zzp5cK7pK9QR8S+4Iab9SHRkzRA4LqfjSk1CLg5Iv410/Jnbpa4eMAW53c/4gvtAvv1xFpCbPgpoztLRjT8z94d0dvA==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch6#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'qF0oK3dr4rqIEqNz2jwhGL/XT15/xNp1ga3OQR+gC15fMYMPumlgTO1eDi5eEW6zY/CfJogE7QnVl5X6ohmiV+Ps9OtI9mFmM9iQQjqNfzB46p2bBt1Xt3RIzZnB5hvLr83LQw==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7', '9f108498-4dd5-4a21-b810-eec9e538953c', '3oIIqlKYJbyT9kd5ZTJ/KJDAtpLo0+5vN9I4cqv/HHLrEEIL14zPwCP9vWLW8miXTw7mixGuXpa84H1x/j/6JmFaatR7ILICxaZKXP8vQbvaq2Wh7Ssc201NfquVh0TV2Pxx7g==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'pDScOnW2phEqOxW+FwDR14embj/FtDEONNrdxb6Ibfid8uAKuRbJ8x6riWJ0f/ajJ9Y23DpI0GLjacHnnmtg/QlU35Hz8C1+ARqm1mcZGNJbvAPILvKa2X6WJoSsXs4ewBJAqQ==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch7#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'GB6Nz/MRi2N/HtT61eKmLngOE4WnE01wYQQotkuS9jGjmE0CQmGmsHsgQlDRsBO0FWxrS8hqV2WpwvW2NU+gQ+z4E84aCWvdMZoVBkmln5piCarRiiwJ7mybS8N5tV6cL2e3tg==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8', '9f108498-4dd5-4a21-b810-eec9e538953c', 'z7j48yULuJB6i99Wf6QxVb/brTmnfSnPq87QiVb6GN+ZX1PfR38IKJXhjloYOfQzI+rNdGfYFnNUvTdR2UB2gYRLQnxw9RmKe0p0W6hkcq0H26Uep2+hB6IhZYIZXFVe3k6FkQ==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8#sub', '9f108498-4dd5-4a21-b810-eec9e538953c', 'W7eyDaD8YkgvSgkTTwsKQSB3SJ0cAVx9uPodNnziapq37JenikCnWO66DxgN50BFSgW2io3+10sBVKY70p7wpjnHXsSMiXZ0KNo7m61kDAMvYSbE1HQORRaRNEGd83U16x/j7g==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('edge://9f108498-4dd5-4a21-b810-eec9e538953c/rajkot-ch8#main', '9f108498-4dd5-4a21-b810-eec9e538953c', 'Qj6N7ViwegvmiQh8DOHm/hEBfoDGSmtPioQePFv8rsdmdKwQzYNCqjVkrO2DYKowIMs4dhOvv9QsWHFMpfz5Z795uDTG4XmhHFu2BJvgkX2lMTjqYdmHNXBLmnofT+dONQC1ww==', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();

COMMIT;
