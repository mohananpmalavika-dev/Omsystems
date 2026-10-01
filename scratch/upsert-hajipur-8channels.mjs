import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

async function main() {
  const branchId = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
  const edgeAgentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const ipAddress = '172.29.91.100';

  const branchRes = await pool.query('SELECT id, path FROM resource_nodes WHERE id = $1', [branchId]);
  if (!branchRes.rows[0]) throw new Error('Branch node not found');
  const branchPath = branchRes.rows[0].path;

  // Profiles and capabilities
  const profiles = JSON.stringify([
    { name: 'main', role: 'main', codec: 'H264', width: 1920, height: 1080 },
    { name: 'sub', role: 'sub', codec: 'H264', width: 640, height: 360, preferredFor: ['live', 'analytics'] }
  ]);
  const capabilities = JSON.stringify({ ptz: false, audio: false, events: true });

  const finalChannels = [];

  for (let ch = 1; ch <= 8; ch++) {
    const channelName = `CPPLUS DVR - Channel ${ch}`;
    const secretRef = `edge://${edgeAgentId}/hajipur-ch${ch}`;

    // Check if a camera row exists for this channel
    const existingCam = await pool.query(
      `SELECT id, resource_node_id, device_identity_id FROM cameras 
       WHERE branch_node_id = $1 AND ip_address = $2 AND recorder_channel = $3`,
      [branchId, ipAddress, ch]
    );

    if (existingCam.rows.length > 0) {
      const cam = existingCam.rows[0];
      console.log(`Updating existing channel ${ch} (ID: ${cam.id})...`);
      await pool.query(
        `UPDATE cameras SET
           edge_agent_id = $1,
           vendor = 'cp-plus',
           model = $2,
           channel = $3,
           protocol = 'rtsp',
           status = 'online'::camera_status,
           profiles = $4::jsonb,
           capabilities = $5::jsonb,
           connection_secret_ref = $6,
           connection_transport = 'edge-gateway',
           source_type = 'analog-dvr-channel',
           recorder_id = 'recorder-hajipur-172-29-91-100',
           recorder_channel = $3,
           last_seen_at = now()
         WHERE id = $7`,
        [edgeAgentId, channelName, ch, profiles, capabilities, secretRef, cam.id]
      );

      // Update resource node name if exists
      if (cam.resource_node_id) {
        await pool.query(
          `UPDATE resource_nodes SET name = $1, is_active = true WHERE id = $2`,
          [channelName, cam.resource_node_id]
        );
      }

      // Update device identity if exists
      if (cam.device_identity_id) {
        await pool.query(
          `UPDATE device_identities SET
             credential_ref = $1,
             edge_agent_id = $2,
             manufacturer = 'cp-plus',
             model = $3,
             channel = $4,
             device_type = 'analog-dvr-channel'
           WHERE id = $5`,
          [secretRef, edgeAgentId, channelName, ch, cam.device_identity_id]
        );
      }

      finalChannels.push({ channel: ch, id: cam.id, action: 'updated' });
    } else {
      console.log(`Inserting new channel ${ch}...`);
      const { randomUUID } = await import('node:crypto');
      const nodeId = randomUUID();
      const ltreeId = nodeId.replace(/-/g, '_');
      await pool.query(
        `INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level)
         SELECT $1, tenant_id, $2, 'camera', $3, (path::text || '.' || $4)::ltree, true, 'normal'
         FROM resource_nodes WHERE id = $2`,
        [nodeId, branchId, channelName, ltreeId]
      );

      // Create device identity
      const identityRes = await pool.query(
        `INSERT INTO device_identities (
           tenant_id, branch_node_id, device_type, manufacturer, model,
           current_ip_address, channel, credential_ref, edge_agent_id
         ) VALUES ($1, $2, 'analog-dvr-channel', 'cp-plus', $3, $4, $5, $6, $7)
         RETURNING id`,
        [tenantId, branchId, channelName, ipAddress, ch, secretRef, edgeAgentId]
      );
      const identityId = identityRes.rows[0].id;

      // Create camera
      const camRes = await pool.query(
        `INSERT INTO cameras (
           resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
           vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
           connection_secret_ref, connection_transport, ip_address, source_type,
           recorder_id, recorder_channel
         ) VALUES (
           $1, $2, $3, $4,
           'cp-plus', $5, $6, 'rtsp', 'online'::camera_status, now(), $7::jsonb, $8::jsonb,
           $9, 'edge-gateway', $10::inet, 'analog-dvr-channel',
           'recorder-hajipur-172-29-91-100', $6
         ) RETURNING id`,
        [
          nodeId, branchId, edgeAgentId, identityId,
          channelName, ch, profiles, capabilities,
          secretRef, ipAddress
        ]
      );
      const newCameraId = camRes.rows[0].id;

      // Link camera_id in device_identities
      await pool.query('UPDATE device_identities SET camera_id = $1 WHERE id = $2', [newCameraId, identityId]);

      finalChannels.push({ channel: ch, id: newCameraId, action: 'created' });
    }
  }

  // Remove the unnumbered camera row if it has no recorder_channel
  await pool.query(
    `DELETE FROM live_sessions WHERE camera_id IN (
       SELECT id FROM cameras WHERE branch_node_id = $1 AND ip_address = $2 AND recorder_channel IS NULL
     )`,
    [branchId, ipAddress]
  );
  await pool.query(
    `DELETE FROM cameras WHERE branch_node_id = $1 AND ip_address = $2 AND recorder_channel IS NULL`,
    [branchId, ipAddress]
  );

  console.log('✅ All 8 channels configured:');
  console.table(finalChannels);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
