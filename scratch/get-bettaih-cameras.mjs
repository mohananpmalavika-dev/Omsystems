import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A"`,
    { encoding: 'utf8' }
  );
}

console.log(runSql(`
SELECT c.channel, c.id, c.connection_secret_ref, c.recorder_channel, c.edge_agent_id
FROM cameras c
JOIN branches b ON b.id = c.branch_node_id
WHERE b.name = 'Bettaih'
ORDER BY c.channel;
`));
