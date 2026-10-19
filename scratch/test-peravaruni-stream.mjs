import { execSync } from 'node:child_process';

function runRemoteSql(sql) {
  const b64 = Buffer.from(sql).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

async function main() {
  console.log('=== Rajkot Cameras ===');
  console.log(runRemoteSql("SELECT id, channel, ip_address, connection_secret_ref, edge_agent_id FROM cameras WHERE branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b' ORDER BY channel;"));
}

main().catch(console.error);
