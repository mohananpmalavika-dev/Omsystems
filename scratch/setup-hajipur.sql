BEGIN;

-- 1. Ensure resource node for Channel 1 is active and named properly
UPDATE resource_nodes 
SET name = 'CP PLUS DVR - Channel 1', is_active = true 
WHERE id = '0d6795cd-4a4d-45ac-b155-11ed41b3d47d';

-- 2. Clean up any stale unlinked nodes for 172.29.91.100
UPDATE resource_nodes SET is_active = false 
WHERE id IN (
  '8a8f0d38-cd53-4a1c-905a-719d59c906b8',
  '14279bca-4224-4a16-b599-7d34735bc52e',
  '2570e837-f992-4c27-9fa6-038801ac4e77',
  'e301a4d2-d9cd-4511-81b3-3b3e8e9cba94',
  '5519aca3-9c7f-44d7-a8e9-ca3cdc4f32e3',
  '2a731c70-8ba9-4d03-b1e8-700995f87f23'
);

-- 3. Check or insert Channel 1 camera
DO $$
DECLARE
  v_cam_id uuid;
BEGIN
  SELECT id INTO v_cam_id FROM cameras WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND ip_address = '172.29.91.100' AND recorder_channel = 1;
  IF v_cam_id IS NULL THEN
    INSERT INTO cameras (
      resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
      vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
      connection_secret_ref, connection_transport, ip_address, source_type,
      recorder_id, recorder_channel
    ) VALUES (
      '0d6795cd-4a4d-45ac-b155-11ed41b3d47d',
      '921d336d-baa9-4b25-9f9f-f6542bba94cc',
      '9f108498-4dd5-4a21-b810-eec9e538953c',
      '8b3b2e35-dd83-4f35-afcb-cb242e2b6c0a',
      'cp-plus', 'CP PLUS DVR - Channel 1', 1, 'rtsp', 'online', now(),
      '[{"name": "sub", "role": "sub", "codec": "H264", "width": 640, "height": 360, "preferredFor": ["live", "analytics"]}, {"name": "main", "role": "main", "codec": "H264", "width": 1920, "height": 1080}]'::jsonb,
      '{"ptz": false, "audio": false, "events": true}'::jsonb,
      'edge://9f108498-4dd5-4a21-b810-eec9e538953c/61790ac5-89a1-4bca-aaae-00ae4d6e1d1e',
      'edge-gateway', '172.29.91.100', 'analog-dvr-channel',
      'recorder-hajipur-172-29-91-100', 1
    );
  END IF;
END $$;

-- 4. Update Channel 2
UPDATE cameras SET
  model = 'CP PLUS DVR - Channel 2',
  channel = 2,
  recorder_channel = 2,
  vendor = 'cp-plus',
  recorder_id = 'recorder-hajipur-172-29-91-100',
  status = 'online',
  connection_transport = 'edge-gateway',
  source_type = 'analog-dvr-channel'
WHERE id = '476352a8-0740-40fb-bee6-0b8f438d9649';
UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 2', is_active = true WHERE id = 'b13730d9-f60b-4e8e-8208-a2bc38646023';

-- 5. Update Channel 3
UPDATE cameras SET
  model = 'CP PLUS DVR - Channel 3',
  channel = 3,
  recorder_channel = 3,
  vendor = 'cp-plus',
  recorder_id = 'recorder-hajipur-172-29-91-100',
  status = 'online',
  connection_transport = 'edge-gateway',
  source_type = 'analog-dvr-channel'
WHERE id = '50c2db97-e88a-4c4b-abd1-03bcc1b63927';
UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 3', is_active = true WHERE id = '3e0e0a7e-a059-43cf-a3aa-3f25fe461a49';

-- 6. Update Channel 4
UPDATE cameras SET
  model = 'CP PLUS DVR - Channel 4',
  channel = 4,
  recorder_channel = 4,
  vendor = 'cp-plus',
  recorder_id = 'recorder-hajipur-172-29-91-100',
  status = 'online',
  connection_transport = 'edge-gateway',
  source_type = 'analog-dvr-channel'
WHERE id = 'e6b322cd-9b50-46c7-ae26-a4b368fbdff2';
UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 4', is_active = true WHERE id = 'b47834af-2d83-404c-ab7b-d0e925ecd71d';

-- 7. Update Channel 5
UPDATE cameras SET
  model = 'CP PLUS DVR - Channel 5',
  channel = 5,
  recorder_channel = 5,
  vendor = 'cp-plus',
  recorder_id = 'recorder-hajipur-172-29-91-100',
  status = 'online',
  connection_transport = 'edge-gateway',
  source_type = 'analog-dvr-channel'
WHERE id = '97280c3c-35f4-4f66-8b98-499b125bf3d2';
UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 5', is_active = true WHERE id = '3743b6b6-3d83-4e19-b98e-3908532815c0';

-- 8. Update Channel 6
UPDATE cameras SET
  model = 'CP PLUS DVR - Channel 6',
  channel = 6,
  recorder_channel = 6,
  vendor = 'cp-plus',
  recorder_id = 'recorder-hajipur-172-29-91-100',
  status = 'online',
  connection_transport = 'edge-gateway',
  source_type = 'analog-dvr-channel'
WHERE id = '41dd6ff1-80e1-45a2-bc28-364280d990c2';
UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 6', is_active = true WHERE id = '9d8b2c19-f43a-481d-b403-011867a06af2';

-- 9. Update Channel 7
UPDATE cameras SET
  model = 'CP PLUS DVR - Channel 7',
  channel = 7,
  recorder_channel = 7,
  vendor = 'cp-plus',
  recorder_id = 'recorder-hajipur-172-29-91-100',
  status = 'online',
  connection_transport = 'edge-gateway',
  source_type = 'analog-dvr-channel'
WHERE id = '53cfacf3-2cc2-4fe7-8af0-8a6c304ff4cd';
UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 7', is_active = true WHERE id = '62ba727f-ad77-40e7-824c-3874b7803f52';

-- 10. Update Channel 8
UPDATE cameras SET
  model = 'CP PLUS DVR - Channel 8',
  channel = 8,
  recorder_channel = 8,
  vendor = 'cp-plus',
  recorder_id = 'recorder-hajipur-172-29-91-100',
  status = 'online',
  connection_transport = 'edge-gateway',
  source_type = 'analog-dvr-channel'
WHERE id = 'db58670d-32aa-4cc6-9934-2772bb58de45';
UPDATE resource_nodes SET name = 'CP PLUS DVR - Channel 8', is_active = true WHERE id = '0a859b0a-7d3b-4ea9-8eec-3ab2583503d7';

-- 11. Ensure all 8 discoveries for 172.29.91.100 are approved
UPDATE camera_discoveries 
SET status = 'approved' 
WHERE ip_address = '172.29.91.100' AND recorder_channel BETWEEN 1 AND 8;

COMMIT;
