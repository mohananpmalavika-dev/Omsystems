import { execSync } from 'child_process';

const branchId = '00000000-0000-4000-8000-000000000104';
const tenantId = '00000000-0000-4000-8000-000000000001';
const edgeAgentId = 'e9b95595-1aa6-4a14-9f5d-bd0c958d3f34';
const branchPath = 'company.operations.local_region.local_camera_pilot';
const ipAddress = '192.168.29.171';

const sql = `
BEGIN;

-- 1. Clean any existing cameras under pilot branch for this IP
DELETE FROM analytics_rules WHERE camera_id IN (SELECT id FROM cameras WHERE branch_node_id = '${branchId}' AND ip_address = '${ipAddress}');
DELETE FROM live_sessions WHERE camera_id IN (SELECT id FROM cameras WHERE branch_node_id = '${branchId}' AND ip_address = '${ipAddress}');
DELETE FROM cameras WHERE branch_node_id = '${branchId}' AND ip_address = '${ipAddress}';

-- 3. Provision all discovered channels for 192.168.29.171
DO $$
DECLARE
  rec RECORD;
  v_node_id uuid;
  v_ltree_id text;
  v_secret_ref text;
  v_rule_id uuid;
BEGIN
  FOR rec IN (
    SELECT id, display_name, recorder_channel, ip_address, device_identity_id, profiles, capabilities, recorder_id
    FROM camera_discoveries
    WHERE branch_node_id = '${branchId}' AND ip_address = '${ipAddress}' AND recorder_channel > 0
    ORDER BY recorder_channel
  ) LOOP
    v_node_id := gen_random_uuid();
    v_ltree_id := replace(v_node_id::text, '-', '_');
    v_secret_ref := 'edge://${edgeAgentId}/' || rec.id::text;

    -- Insert active resource node
    INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level)
    VALUES (v_node_id, '${tenantId}', '${branchId}', 'camera', rec.display_name, ('${branchPath}' || '.' || v_ltree_id)::ltree, true, 'normal');

    -- Insert camera
    INSERT INTO cameras (
      id, resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
      vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
      connection_secret_ref, connection_transport, ip_address, source_type,
      recorder_id, recorder_channel
    ) VALUES (
      rec.id, v_node_id, '${branchId}', '${edgeAgentId}', rec.device_identity_id,
      'cp-plus', rec.display_name, rec.recorder_channel, 'rtsp', 'online'::camera_status, now(),
      rec.profiles, rec.capabilities,
      v_secret_ref, 'edge-gateway', rec.ip_address::inet, 'analog-dvr-channel',
      rec.recorder_id, rec.recorder_channel
    );

    -- Link device identity
    IF rec.device_identity_id IS NOT NULL THEN
      UPDATE device_identities SET
        camera_id = rec.id,
        credential_ref = v_secret_ref,
        edge_agent_id = '${edgeAgentId}',
        channel = rec.recorder_channel,
        last_seen_at = now()
      WHERE id = rec.device_identity_id;
    END IF;

    -- Approve discovery
    UPDATE camera_discoveries SET status = 'approved' WHERE id = rec.id;

    -- Add helmet-worn analytics rule for this camera
    v_rule_id := gen_random_uuid();
    INSERT INTO analytics_rules (
      id, tenant_id, camera_id, name, detection_type, enabled,
      min_confidence, min_duration_seconds, direction, severity,
      cooldown_seconds, recording_policy, pre_roll_seconds, post_roll_seconds,
      object_classes, created_by, created_at, updated_at
    ) VALUES (
      v_rule_id, '${tenantId}', rec.id, 'AI - Helmet worn inside bank', 'helmet-worn', true,
      0.6500, 1.000, 'any', 'P2',
      60, 'event-recording', 30, 120,
      '["helmet", "person"]'::jsonb, '00000000-0000-4000-8000-000000000201', now(), now()
    );

  END LOOP;
END $$;

COMMIT;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log('Applying pilot cameras provisioning to GCP Postgres...');
console.log(execSync(cmd, { encoding: 'utf8' }));

// Verify
const verifySql = `
SELECT c.id, c.model, c.channel, c.status, c.connection_secret_ref, ar.detection_type, ar.enabled as rule_enabled
FROM cameras c
LEFT JOIN analytics_rules ar ON ar.camera_id = c.id
WHERE c.branch_node_id = '${branchId}'
ORDER BY c.channel;
`;
const verifyB64 = Buffer.from(verifySql).toString('base64');
const verifyCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${verifyB64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log('=== VERIFYING PILOT CAMERAS ===');
console.log(execSync(verifyCmd, { encoding: 'utf8' }));
