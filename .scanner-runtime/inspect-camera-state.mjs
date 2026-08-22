import pg from "pg";

const branchId = "00000000-0000-4000-8000-000000000104";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const database = await pool.query("SELECT current_database() AS name");
  const discoveries = await pool.query(
    `SELECT host(ip_address) AS ip_address, recorder_channel, status,
            credentials_required, stream_verified, compatibility,
            duplicate_status, discovered_at
       FROM camera_discoveries
      WHERE branch_node_id = $1
      ORDER BY discovered_at DESC, recorder_channel`,
    [branchId],
  );
  const cameras = await pool.query(
    `SELECT id::text, name, channel, status, source_type, recorder_channel
       FROM cameras
      WHERE branch_node_id = $1
      ORDER BY channel`,
    [branchId],
  );
  const agents = await pool.query(
    `SELECT id::text, name, status, last_seen_at
       FROM edge_agents
      WHERE branch_node_id = $1
      ORDER BY last_seen_at DESC NULLS LAST`,
    [branchId],
  );

  process.stdout.write(JSON.stringify({
    database: database.rows[0]?.name,
    discoveries: discoveries.rows,
    cameras: cameras.rows,
    agents: agents.rows,
  }, null, 2));
} finally {
  await pool.end();
}
