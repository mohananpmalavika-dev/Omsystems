import { execSync } from 'child_process';

function runSql(sql) {
  const cleanSql = sql.replace(/"/g, '\\"');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${cleanSql}\\""`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('=== RESOURCE NODES FOR HAJIPUR ===');
console.log(runSql("SELECT rn.id, rn.name, rn.node_type, c.id as camera_id, c.recorder_channel, c.status FROM resource_nodes rn LEFT JOIN cameras c ON c.resource_node_id = rn.id WHERE rn.parent_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc';"));
