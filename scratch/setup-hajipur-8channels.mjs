import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

async function main() {
  const client = await pool.connect();
  try {
    const branchId = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
    const edgeAgentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
    const tenantId = '00000000-0000-4000-8000-000000000001';
    const ipAddress = '172.29.91.100';

    await client.query('BEGIN');

    // 1. Get branch info
    const branchRes = await client.query('SELECT id, path FROM resource_nodes WHERE id = $1', [branchId]);
    if (!branchRes.rows[0]) throw new Error('Branch node not found');
    const branchPath = branchRes.rows[0].path;

    // 2. Remove old unlinked/duplicate camera rows for 172.29.91.100 to have clean 8 channels
    console.log('Cleaning old camera records for 172.29.91.100 in Hajipur...');
    const oldCams = await client.query(
      `SELECT id, resource_node_id, device_identity_id FROM cameras WHERE branch_node_id = $1 AND ip_address = $2`,
      [branchId, ipAddress]
    );
    for (const cam of oldCams.rows) {
      await client.query('DELETE FROM live_sessions WHERE camera_id = $1', [cam.id]);
      await client.query('DELETE FROM cameras WHERE id = $1', [cam.id]);
      if (cam.device_identity_id) {
        await client.query('DELETE FROM device_identities WHERE id = $1', [cam.device_identity_id]).catch(() => undefined);
      }
      if (cam.resource_node_id) {
        await client.query('DELETE FROM resource_nodes WHERE id = $1', [cam.resource_node_id]).catch(() => undefined);
      }
    }

    console.log('Creating clean 8 channels for Hajipur DVR...');
    const createdCameras = [];

    for (let ch = 1; ch <= 8; ch++) {
      const channelName = `Hajipur - Channel ${ch}`;
      const secretRef = `edge://${edgeAgentId}/hajipur-ch${ch}`;

      // Create resource node
      const nodeRes = await client.query(
        `INSERT INTO resource_nodes (tenant_id, parent_id, node_type, name, is_active, sensitivity_level)
         VALUES ($1, $2, 'camera', $3, true, 'normal')
         RETURNING id`,
        [tenantId, branchId, channelName]
      );
      const nodeId = nodeRes.rows[0].id;

      // Update path
      const ltreeId = nodeId.replace(/-/g, '_');
      await client.query(
        `UPDATE resource_nodes SET path = ($1 || '.' || $2)::ltree WHERE id = $3`,
        [branchPath, ltreeId, nodeId]
      );

      // Create device identity
      const identityRes = await client.query(
        `INSERT INTO device_identities (
           tenant_id, branch_node_id, device_type, manufacturer, model,
           current_ip_address, channel, credential_ref, edge_agent_id
         ) VALUES ($1, $2, 'analog-dvr-channel', 'cp-plus', $3, $4, $5, $6, $7)
         RETURNING id`,
        [tenantId, branchId, `CPPLUS DVR - Channel ${ch}`, ipAddress, ch, secretRef, edgeAgentId]
      );
      const identityId = identityRes.rows[0].id;

      // Create camera
      const profiles = JSON.stringify([
        { name: 'main', role: 'main', codec: 'H264', width: 1920, height: 1080 },
        { name: 'sub', role: 'sub', codec: 'H264', width: 640, height: 360, preferredFor: ['live', 'analytics'] }
      ]);
      const capabilities = JSON.stringify({ ptz: false, audio: false, events: true });

      const camRes = await client.query(
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
         ) RETURNING id, channel, model, connection_secret_ref`,
        [
          nodeId, branchId, edgeAgentId, identityId,
          `CPPLUS DVR - Channel ${ch}`, ch, profiles, capabilities,
          secretRef, ipAddress
        ]
      );

      // Update camera_id on device_identities
      await client.query('UPDATE device_identities SET camera_id = $1 WHERE id = $2', [camRes.rows[0].id, identityId]);

      createdCameras.push(camRes.rows[0]);
    }

    await client.query('COMMIT');
    console.log('✅ Successfully created all 8 channels:');
    console.table(createdCameras);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during setup:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
