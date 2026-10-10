import { execSync } from 'child_process';

const sql = `
SELECT * FROM analytics_zones;
SELECT * FROM nbfc_analytics_zones;
SELECT id, name, node_type, sensitivity_level, metadata FROM resource_nodes WHERE metadata IS NOT NULL AND metadata::text != '{}';
SELECT id, name, node_type, sensitivity_level FROM resource_nodes WHERE name ILIKE '%vault%' OR name ILIKE '%strong%' OR name ILIKE '%locker%';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
