import { execSync } from 'child_process';

const script = `
import { createClient } from 'redis';
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

try {
  const keys = await redis.keys('analytics:latest-frame:*');
  const camIds = keys.map(k => k.replace('analytics:latest-frame:', ''));
  
  const cameras = (await db.query(\`
    SELECT c.id, c.channel, c.ip_address, c.edge_agent_id, c.branch_node_id, 
           bn.name as branch_name, rn.name as camera_name, c.status
    FROM cameras c
    JOIN resource_nodes rn ON c.resource_node_id = rn.id
    LEFT JOIN resource_nodes bn ON c.branch_node_id = bn.id
    WHERE c.id = ANY($1)
  \`, [camIds])).rows;

  console.log('--- CAMERAS CURRENTLY SENDING FRAMES (' + cameras.length + ') ---');
  for (const c of cameras) {
    console.log(\`Branch: \${c.branch_name} | Cam: \${c.camera_name} (ch \${c.channel}) | ID: \${c.id} | EdgeAgent: \${c.edge_agent_id} | IP: \${c.ip_address}\`);
  }

  // Also check all cameras assigned to agent b950f232-557e-42cd-8bc8-8f4490d0b68b or branch local pilot
  console.log('\\n--- CAMERAS ASSIGNED TO CURRENT LOCAL PILOT SCANNER (b950f232-557e-42cd-8bc8-8f4490d0b68b) ---');
  const agentCams = (await db.query(\`
    SELECT c.id, c.channel, c.ip_address, c.edge_agent_id, rn.name as camera_name, c.status
    FROM cameras c
    JOIN resource_nodes rn ON c.resource_node_id = rn.id
    WHERE c.edge_agent_id = 'b950f232-557e-42cd-8bc8-8f4490d0b68b'
  \`)).rows;
  console.log(JSON.stringify(agentCams, null, 2));

  console.log('\\n--- CAMERA DISCOVERIES FOR CURRENT LOCAL PILOT SCANNER ---');
  const discoveries = (await db.query(\`
    SELECT id, edge_agent_id, display_name, ip_address, recorder_channel, status, last_seen_at
    FROM camera_discoveries
    WHERE edge_agent_id IN ('b950f232-557e-42cd-8bc8-8f4490d0b68b', 'e9b95595-1aa6-4a14-9f5d-bd0c958d3f34')
    ORDER BY last_seen_at DESC
    LIMIT 20
  \`)).rows;
  console.log(JSON.stringify(discoveries, null, 2));

} finally {
  await redis.quit();
  await db.end();
}
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
