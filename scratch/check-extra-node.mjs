import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`,
    { encoding: 'utf8' }
  );
}

console.log(runSql(`SELECT * FROM cameras WHERE resource_node_id = 'e4565a23-474c-409b-ba0a-5918547b52bc' OR id = 'e4565a23-474c-409b-ba0a-5918547b52bc';`));
console.log(runSql(`SELECT * FROM resource_nodes WHERE id = 'e4565a23-474c-409b-ba0a-5918547b52bc';`));
