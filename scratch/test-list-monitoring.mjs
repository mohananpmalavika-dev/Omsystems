import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

async function main() {
  const agentId = '9f108498-4dd5-4a21-b810-eec9e538953c';

  const res = await pool.query(
    `SELECT cameras.id::text, camera_node.name, cameras.vendor,
            cameras.connection_secret_ref, cameras.ip_address::text,
            cameras.source_type, cameras.recorder_channel, cameras.status
     FROM cameras
     JOIN resource_nodes camera_node ON camera_node.id = cameras.resource_node_id AND camera_node.is_active = true
     JOIN resource_nodes branch_node ON branch_node.id = cameras.branch_node_id AND branch_node.is_active = true
     WHERE (
       cameras.edge_agent_id = $1::uuid
       OR cameras.branch_node_id = (SELECT branch_node_id FROM edge_agents WHERE id = $1::uuid)
     )
     ORDER BY cameras.recorder_channel ASC`,
    [agentId]
  );

  console.log(`Found ${res.rows.length} cameras for agent:`);
  console.table(res.rows);
  await pool.end();
}

main().catch(console.error);
