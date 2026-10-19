
BEGIN;

-- Reassign analytics and tracking data from duplicates to original channels

UPDATE analytics_events SET camera_id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c' WHERE camera_id = '9c8c0914-452c-44a3-8ca3-7e07482fbbce';
UPDATE analytics_alerts SET camera_id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c' WHERE camera_id = '9c8c0914-452c-44a3-8ca3-7e07482fbbce';
UPDATE detected_objects SET camera_id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c' WHERE camera_id = '9c8c0914-452c-44a3-8ca3-7e07482fbbce';

UPDATE analytics_events SET camera_id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df' WHERE camera_id = 'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66';
UPDATE analytics_alerts SET camera_id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df' WHERE camera_id = 'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66';
UPDATE detected_objects SET camera_id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df' WHERE camera_id = 'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66';

UPDATE analytics_events SET camera_id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d' WHERE camera_id = 'fb9fbf75-4009-4ef1-9e13-a85d4042f410';
UPDATE analytics_alerts SET camera_id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d' WHERE camera_id = 'fb9fbf75-4009-4ef1-9e13-a85d4042f410';
UPDATE detected_objects SET camera_id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d' WHERE camera_id = 'fb9fbf75-4009-4ef1-9e13-a85d4042f410';

UPDATE analytics_events SET camera_id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76' WHERE camera_id = '6a949b74-113a-4545-9566-3813fd96540b';
UPDATE analytics_alerts SET camera_id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76' WHERE camera_id = '6a949b74-113a-4545-9566-3813fd96540b';
UPDATE detected_objects SET camera_id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76' WHERE camera_id = '6a949b74-113a-4545-9566-3813fd96540b';

UPDATE analytics_events SET camera_id = '9cf710ef-1a0b-444b-9c30-abbac95948fe' WHERE camera_id = 'c5a1b894-900e-486d-a2dc-1ff1e6b956fc';
UPDATE analytics_alerts SET camera_id = '9cf710ef-1a0b-444b-9c30-abbac95948fe' WHERE camera_id = 'c5a1b894-900e-486d-a2dc-1ff1e6b956fc';
UPDATE detected_objects SET camera_id = '9cf710ef-1a0b-444b-9c30-abbac95948fe' WHERE camera_id = 'c5a1b894-900e-486d-a2dc-1ff1e6b956fc';

UPDATE analytics_events SET camera_id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8' WHERE camera_id = '0ab3ebd0-505a-4752-b327-006f208e209e';
UPDATE analytics_alerts SET camera_id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8' WHERE camera_id = '0ab3ebd0-505a-4752-b327-006f208e209e';
UPDATE detected_objects SET camera_id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8' WHERE camera_id = '0ab3ebd0-505a-4752-b327-006f208e209e';

UPDATE analytics_events SET camera_id = '3baa601f-67e0-4e0e-905d-0688df725bf1' WHERE camera_id = 'eda4dbac-3fc9-4b83-8e65-d1993dbb0be8';
UPDATE analytics_alerts SET camera_id = '3baa601f-67e0-4e0e-905d-0688df725bf1' WHERE camera_id = 'eda4dbac-3fc9-4b83-8e65-d1993dbb0be8';
UPDATE detected_objects SET camera_id = '3baa601f-67e0-4e0e-905d-0688df725bf1' WHERE camera_id = 'eda4dbac-3fc9-4b83-8e65-d1993dbb0be8';

UPDATE analytics_events SET camera_id = '14d869da-4642-4d74-9de0-c4c6c2be4488' WHERE camera_id = 'b89d7170-5982-41b5-9a8a-274ddc31b836';
UPDATE analytics_alerts SET camera_id = '14d869da-4642-4d74-9de0-c4c6c2be4488' WHERE camera_id = 'b89d7170-5982-41b5-9a8a-274ddc31b836';
UPDATE detected_objects SET camera_id = '14d869da-4642-4d74-9de0-c4c6c2be4488' WHERE camera_id = 'b89d7170-5982-41b5-9a8a-274ddc31b836';

-- Delete recording jobs for duplicates (unique constraint on camera_id)
DELETE FROM recording_jobs WHERE camera_id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');

-- Delete live sessions and health telemetry for duplicates
DELETE FROM live_sessions WHERE camera_id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');
DELETE FROM operational_health_telemetry WHERE device_id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');
DELETE FROM operational_health_latest WHERE device_id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');

-- Delete duplicate rules (since original already has identical rule set)
DELETE FROM analytics_rules WHERE camera_id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');

-- Unlink camera discoveries pointing to duplicate device identities
UPDATE camera_discoveries 
SET device_identity_id = NULL 
WHERE device_identity_id IN (SELECT id FROM device_identities WHERE camera_id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836'));

-- Delete device identities attached to duplicate cameras
DELETE FROM device_identities WHERE camera_id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');

-- Delete duplicate cameras
DELETE FROM cameras WHERE id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');

-- Delete duplicate resource nodes
DELETE FROM resource_nodes WHERE id IN ('264e7203-1399-46fa-a651-750a3ab22499','a69b476e-b355-4e50-bce9-a52cd0ff68ab','7939cb15-4426-4463-a519-031644a7edb3','edf30416-b410-4e34-b3d2-aa265075b2af','1a0fd477-e767-4c80-95f9-eb5794e93acc','93f70b14-2def-47f1-8043-505b59deed95','f3e66c24-3327-43bd-a13a-b887385ff816','9cdc53e0-73bc-437f-b38d-adab5aae3318');

-- Clean up any orphaned empty camera resource nodes under Peravaruni branch
DELETE FROM resource_nodes 
WHERE parent_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' 
  AND id NOT IN (SELECT resource_node_id FROM cameras WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61')
  AND node_type = 'camera';

COMMIT;

-- Verify final camera count in Peravaruni
SELECT count(*) as final_camera_count FROM cameras WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';
SELECT c.channel, rn.name, c.status, c.ip_address, c.recorder_id, c.edge_agent_id
FROM cameras c
JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61'
ORDER BY c.channel;
