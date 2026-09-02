#!/usr/bin/env node

import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const result = await pool.query(`
    SELECT branch.id::text AS branch_id,
           branch.name AS branch_name,
           agent.id::text AS agent_id,
           agent.name AS agent_name,
           agent.status AS stored_agent_status,
           agent.last_seen_at,
           agent.public_media_url,
           agent.local_media_url,
           count(camera.id)::int AS camera_count,
           count(camera.id) FILTER (WHERE camera.status = 'online')::int AS online_count,
           count(camera.id) FILTER (WHERE camera.edge_agent_id = agent.id)::int AS assigned_count
    FROM resource_nodes branch
    LEFT JOIN edge_agents agent ON agent.branch_node_id = branch.id
    LEFT JOIN cameras camera ON camera.branch_node_id = branch.id
    WHERE branch.node_type = 'branch'
    GROUP BY branch.id, branch.name, agent.id, agent.name, agent.status,
             agent.last_seen_at, agent.public_media_url, agent.local_media_url
    ORDER BY branch.name, agent.name
  `);

  const now = Date.now();
  const report = result.rows.map((row) => ({
    branchId: row.branch_id,
    branchName: row.branch_name,
    agentId: row.agent_id,
    agentName: row.agent_name,
    storedAgentStatus: row.stored_agent_status,
    lastSeenSecondsAgo: row.last_seen_at
      ? Math.max(0, Math.round((now - new Date(row.last_seen_at).getTime()) / 1_000))
      : null,
    publicMediaOrigin: safeOrigin(row.public_media_url),
    localMediaOrigin: safeOrigin(row.local_media_url),
    cameraCount: row.camera_count,
    onlineCount: row.online_count,
    assignedCount: row.assigned_count,
  }));

  console.log(JSON.stringify(report, null, 2));
} finally {
  await pool.end();
}

function safeOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return "invalid_url";
  }
}
