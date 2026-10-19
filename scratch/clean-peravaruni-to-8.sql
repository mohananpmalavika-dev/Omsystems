
BEGIN;

-- Lock duplicate camera rows to prevent concurrent inserts into child tables
SELECT id FROM cameras WHERE id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836') FOR UPDATE;

-- 1. Reassign alerts, events, and live sessions to original cameras

UPDATE analytics_alerts a
SET camera_id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c',
    rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = a.rule_id 
       WHERE orig_r.camera_id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c' LIMIT 1)
    )
WHERE a.camera_id = '9c8c0914-452c-44a3-8ca3-7e07482fbbce';

UPDATE analytics_events e
SET camera_id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c',
    primary_rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = e.primary_rule_id 
       WHERE orig_r.camera_id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c' LIMIT 1)
    )
WHERE e.camera_id = '9c8c0914-452c-44a3-8ca3-7e07482fbbce';

UPDATE detected_objects SET camera_id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c' WHERE camera_id = '9c8c0914-452c-44a3-8ca3-7e07482fbbce';
UPDATE live_sessions SET camera_id = '4d3caa3d-e03d-4689-81a6-a10e6f26329c' WHERE camera_id = '9c8c0914-452c-44a3-8ca3-7e07482fbbce';

UPDATE analytics_alerts a
SET camera_id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df',
    rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = a.rule_id 
       WHERE orig_r.camera_id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df' LIMIT 1)
    )
WHERE a.camera_id = 'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66';

UPDATE analytics_events e
SET camera_id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df',
    primary_rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = e.primary_rule_id 
       WHERE orig_r.camera_id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df' LIMIT 1)
    )
WHERE e.camera_id = 'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66';

UPDATE detected_objects SET camera_id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df' WHERE camera_id = 'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66';
UPDATE live_sessions SET camera_id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df' WHERE camera_id = 'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66';

UPDATE analytics_alerts a
SET camera_id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d',
    rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = a.rule_id 
       WHERE orig_r.camera_id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d' LIMIT 1)
    )
WHERE a.camera_id = 'fb9fbf75-4009-4ef1-9e13-a85d4042f410';

UPDATE analytics_events e
SET camera_id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d',
    primary_rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = e.primary_rule_id 
       WHERE orig_r.camera_id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d' LIMIT 1)
    )
WHERE e.camera_id = 'fb9fbf75-4009-4ef1-9e13-a85d4042f410';

UPDATE detected_objects SET camera_id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d' WHERE camera_id = 'fb9fbf75-4009-4ef1-9e13-a85d4042f410';
UPDATE live_sessions SET camera_id = '940fb6f4-7c41-4c92-b4f1-85a459ebb38d' WHERE camera_id = 'fb9fbf75-4009-4ef1-9e13-a85d4042f410';

UPDATE analytics_alerts a
SET camera_id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76',
    rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = a.rule_id 
       WHERE orig_r.camera_id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76' LIMIT 1)
    )
WHERE a.camera_id = '6a949b74-113a-4545-9566-3813fd96540b';

UPDATE analytics_events e
SET camera_id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76',
    primary_rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = e.primary_rule_id 
       WHERE orig_r.camera_id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76' LIMIT 1)
    )
WHERE e.camera_id = '6a949b74-113a-4545-9566-3813fd96540b';

UPDATE detected_objects SET camera_id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76' WHERE camera_id = '6a949b74-113a-4545-9566-3813fd96540b';
UPDATE live_sessions SET camera_id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76' WHERE camera_id = '6a949b74-113a-4545-9566-3813fd96540b';

UPDATE analytics_alerts a
SET camera_id = '9cf710ef-1a0b-444b-9c30-abbac95948fe',
    rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = a.rule_id 
       WHERE orig_r.camera_id = '9cf710ef-1a0b-444b-9c30-abbac95948fe' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '9cf710ef-1a0b-444b-9c30-abbac95948fe' LIMIT 1)
    )
WHERE a.camera_id = 'c5a1b894-900e-486d-a2dc-1ff1e6b956fc';

UPDATE analytics_events e
SET camera_id = '9cf710ef-1a0b-444b-9c30-abbac95948fe',
    primary_rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = e.primary_rule_id 
       WHERE orig_r.camera_id = '9cf710ef-1a0b-444b-9c30-abbac95948fe' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '9cf710ef-1a0b-444b-9c30-abbac95948fe' LIMIT 1)
    )
WHERE e.camera_id = 'c5a1b894-900e-486d-a2dc-1ff1e6b956fc';

UPDATE detected_objects SET camera_id = '9cf710ef-1a0b-444b-9c30-abbac95948fe' WHERE camera_id = 'c5a1b894-900e-486d-a2dc-1ff1e6b956fc';
UPDATE live_sessions SET camera_id = '9cf710ef-1a0b-444b-9c30-abbac95948fe' WHERE camera_id = 'c5a1b894-900e-486d-a2dc-1ff1e6b956fc';

UPDATE analytics_alerts a
SET camera_id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8',
    rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = a.rule_id 
       WHERE orig_r.camera_id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8' LIMIT 1)
    )
WHERE a.camera_id = '0ab3ebd0-505a-4752-b327-006f208e209e';

UPDATE analytics_events e
SET camera_id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8',
    primary_rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = e.primary_rule_id 
       WHERE orig_r.camera_id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8' LIMIT 1)
    )
WHERE e.camera_id = '0ab3ebd0-505a-4752-b327-006f208e209e';

UPDATE detected_objects SET camera_id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8' WHERE camera_id = '0ab3ebd0-505a-4752-b327-006f208e209e';
UPDATE live_sessions SET camera_id = 'fc1a1f29-8b1c-4743-a093-40584e1a96a8' WHERE camera_id = '0ab3ebd0-505a-4752-b327-006f208e209e';

UPDATE analytics_alerts a
SET camera_id = '3baa601f-67e0-4e0e-905d-0688df725bf1',
    rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = a.rule_id 
       WHERE orig_r.camera_id = '3baa601f-67e0-4e0e-905d-0688df725bf1' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '3baa601f-67e0-4e0e-905d-0688df725bf1' LIMIT 1)
    )
WHERE a.camera_id = 'eda4dbac-3fc9-4b83-8e65-d1993dbb0be8';

UPDATE analytics_events e
SET camera_id = '3baa601f-67e0-4e0e-905d-0688df725bf1',
    primary_rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = e.primary_rule_id 
       WHERE orig_r.camera_id = '3baa601f-67e0-4e0e-905d-0688df725bf1' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '3baa601f-67e0-4e0e-905d-0688df725bf1' LIMIT 1)
    )
WHERE e.camera_id = 'eda4dbac-3fc9-4b83-8e65-d1993dbb0be8';

UPDATE detected_objects SET camera_id = '3baa601f-67e0-4e0e-905d-0688df725bf1' WHERE camera_id = 'eda4dbac-3fc9-4b83-8e65-d1993dbb0be8';
UPDATE live_sessions SET camera_id = '3baa601f-67e0-4e0e-905d-0688df725bf1' WHERE camera_id = 'eda4dbac-3fc9-4b83-8e65-d1993dbb0be8';

UPDATE analytics_alerts a
SET camera_id = '14d869da-4642-4d74-9de0-c4c6c2be4488',
    rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = a.rule_id 
       WHERE orig_r.camera_id = '14d869da-4642-4d74-9de0-c4c6c2be4488' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '14d869da-4642-4d74-9de0-c4c6c2be4488' LIMIT 1)
    )
WHERE a.camera_id = 'b89d7170-5982-41b5-9a8a-274ddc31b836';

UPDATE analytics_events e
SET camera_id = '14d869da-4642-4d74-9de0-c4c6c2be4488',
    primary_rule_id = COALESCE(
      (SELECT orig_r.id FROM analytics_rules orig_r 
       JOIN analytics_rules dup_r ON dup_r.id = e.primary_rule_id 
       WHERE orig_r.camera_id = '14d869da-4642-4d74-9de0-c4c6c2be4488' AND orig_r.detection_type = dup_r.detection_type LIMIT 1),
      (SELECT id FROM analytics_rules WHERE camera_id = '14d869da-4642-4d74-9de0-c4c6c2be4488' LIMIT 1)
    )
WHERE e.camera_id = 'b89d7170-5982-41b5-9a8a-274ddc31b836';

UPDATE detected_objects SET camera_id = '14d869da-4642-4d74-9de0-c4c6c2be4488' WHERE camera_id = 'b89d7170-5982-41b5-9a8a-274ddc31b836';
UPDATE live_sessions SET camera_id = '14d869da-4642-4d74-9de0-c4c6c2be4488' WHERE camera_id = 'b89d7170-5982-41b5-9a8a-274ddc31b836';

-- 2. Delete recording jobs for duplicates
DELETE FROM recording_jobs WHERE camera_id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');

-- 3. Delete live sessions and health telemetry for duplicates
DELETE FROM live_sessions WHERE camera_id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');
DELETE FROM operational_health_telemetry WHERE device_id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');
DELETE FROM operational_health_latest WHERE device_id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');

-- 4. Delete duplicate rules
DELETE FROM analytics_rules WHERE camera_id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');

-- 5. Delete duplicate cameras (device_identities.camera_id will ON DELETE SET NULL automatically)
DELETE FROM cameras WHERE id IN ('9c8c0914-452c-44a3-8ca3-7e07482fbbce','b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66','fb9fbf75-4009-4ef1-9e13-a85d4042f410','6a949b74-113a-4545-9566-3813fd96540b','c5a1b894-900e-486d-a2dc-1ff1e6b956fc','0ab3ebd0-505a-4752-b327-006f208e209e','eda4dbac-3fc9-4b83-8e65-d1993dbb0be8','b89d7170-5982-41b5-9a8a-274ddc31b836');

-- 8. Deactivate duplicate resource nodes
UPDATE resource_nodes SET is_active = false WHERE id IN ('264e7203-1399-46fa-a651-750a3ab22499','a69b476e-b355-4e50-bce9-a52cd0ff68ab','7939cb15-4426-4463-a519-031644a7edb3','edf30416-b410-4e34-b3d2-aa265075b2af','1a0fd477-e767-4c80-95f9-eb5794e93acc','93f70b14-2def-47f1-8043-505b59deed95','f3e66c24-3327-43bd-a13a-b887385ff816','9cdc53e0-73bc-437f-b38d-adab5aae3318');

-- 9. Deactivate any other unattached camera nodes under Peravaruni
UPDATE resource_nodes 
SET is_active = false 
WHERE parent_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' 
  AND id NOT IN (SELECT resource_node_id FROM cameras WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61')
  AND node_type = 'camera';

COMMIT;

-- Verification
SELECT count(*) as total_peravaruni_cameras FROM cameras WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';
SELECT c.channel, rn.name, c.status, c.ip_address, c.recorder_id, c.edge_agent_id
FROM cameras c
JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61'
ORDER BY c.channel;
