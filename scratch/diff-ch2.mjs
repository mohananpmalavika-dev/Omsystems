import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

console.log(runSql(`
SELECT id, channel, recorder_channel, recorder_id, vendor, model, protocol, status, profiles, capabilities, connection_secret_ref, connection_transport, source_type, ip_address, edge_agent_id
FROM cameras 
WHERE id IN ('c7ef14ba-67eb-4d15-a173-9c56d51bbb53', 'cb033076-8aa8-4f18-9ab5-8acf11ce28e8');
`));
