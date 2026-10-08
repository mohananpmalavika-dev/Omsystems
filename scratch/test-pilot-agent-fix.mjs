import { execSync } from 'child_process';

const testScript = `
import pg from 'pg';
import { loadConfig } from '/app/dist/src/config.js';
import { PostgresStore } from '/app/dist/src/database/postgres-store.js';

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
const store = new PostgresStore(pool);

try {
  const activeAgentId = 'b950f232-557e-42cd-8bc8-8f4490d0b68b';
  const branchId = '00000000-0000-4000-8000-000000000104';

  console.log('1. Checking cameras currently listed for active agent:');
  const initialCams = await store.listCamerasByEdgeAgent(activeAgentId);
  console.log('Count:', initialCams.length);

  console.log('2. Updating cameras edge_agent_id to active agent...');
  await pool.query(\`
    UPDATE cameras 
    SET edge_agent_id = $1, status = 'online', last_seen_at = now()
    WHERE branch_node_id = $2
  \`, [activeAgentId, branchId]);

  console.log('3. Checking cameras after update:');
  const updatedCams = await store.listCamerasByEdgeAgent(activeAgentId);
  console.log('Count:', updatedCams.length);
  for (const cam of updatedCams) {
    const resolvedSecret = await store.resolveStreamSecret(cam.connectionSecretRef, activeAgentId);
    console.log(\`Camera: \${cam.name} (ch \${cam.channel}), ID: \${cam.id}, ref: \${cam.connectionSecretRef}\`);
    console.log(\`  -> Resolved Secret: \${resolvedSecret ? 'SUCCESS! ' + resolvedSecret.replace(/:[^:@]+@/, ':***@') : 'FAILED'}\`);
  }

} finally {
  await pool.end();
}
`;

const b64 = Buffer.from(testScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
