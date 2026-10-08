import { execSync } from 'child_process';

const script = `
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

try {
  const branchId = '00000000-0000-4000-8000-000000000104';
  
  console.log('--- CAMERAS IN LOCAL PILOT BRANCH ---');
  const cams = (await db.query(\`
    SELECT c.id, c.channel, c.edge_agent_id, c.connection_secret_ref, c.ip_address, rn.name
    FROM cameras c
    JOIN resource_nodes rn ON c.resource_node_id = rn.id
    WHERE c.branch_node_id = $1
    ORDER BY c.channel
  \`, [branchId])).rows;
  console.log(JSON.stringify(cams, null, 2));

  console.log('\\n--- DISCOVERIES FROM NEW AGENT b950f232-557e-42cd-8bc8-8f4490d0b68b ---');
  const disc = (await db.query(\`
    SELECT id, edge_agent_id, branch_node_id, display_name, ip_address, recorder_channel, status, created_at, updated_at
    FROM camera_discoveries
    WHERE edge_agent_id = 'b950f232-557e-42cd-8bc8-8f4490d0b68b'
    ORDER BY recorder_channel
  \`)).rows;
  console.log(JSON.stringify(disc, null, 2));

  console.log('\\n--- ALL DISCOVERIES FOR LOCAL PILOT BRANCH ---');
  const branchDisc = (await db.query(\`
    SELECT id, edge_agent_id, display_name, ip_address, recorder_channel, status, created_at, updated_at
    FROM camera_discoveries
    WHERE branch_node_id = $1
    ORDER BY updated_at DESC
    LIMIT 20
  \`, [branchId])).rows;
  console.log(JSON.stringify(branchDisc, null, 2));

} finally {
  await db.end();
}
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
