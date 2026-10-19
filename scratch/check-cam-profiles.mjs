import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

console.log(runSql(`SELECT id, model, channel, connection_secret_ref, edge_agent_id, profiles FROM cameras WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' LIMIT 2;`));
