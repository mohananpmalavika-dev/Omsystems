import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

console.log("=== BETTAIH CH 2 CAMERA ===");
console.log(runSql("SELECT id, channel, recorder_channel, connection_secret_ref, edge_agent_id FROM cameras WHERE id = 'cb033076-79ec-4581-8178-011855e2d677';"));

console.log("=== KOLLAM CH 2 CAMERA ===");
console.log(runSql("SELECT id, channel, recorder_channel, connection_secret_ref, edge_agent_id FROM cameras WHERE id = 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53';"));
