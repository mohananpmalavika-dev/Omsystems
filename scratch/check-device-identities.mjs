import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log('=== DEVICE IDENTITIES COLUMNS ===');
console.log(runSql(`
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'device_identities';
`));

console.log('=== DEVICE IDENTITIES FOR HAJIPUR ===');
console.log(runSql(`
SELECT * FROM device_identities WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
`));
