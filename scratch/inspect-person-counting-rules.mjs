import { execSync } from 'child_process';

const sql = `
SELECT id, name, detection_type, enabled, branch_id, camera_id 
FROM analytics_rules 
WHERE id IN (
  '7f90babd-8fff-4465-9e8e-a3330dd589ec',
  'ce84e334-6109-4cfb-a7e1-72461cb3e111',
  '4c4e3f8f-bafa-464c-9495-9bd6fb47c4fb'
);

SELECT DISTINCT detection_type, count(*), array_agg(DISTINCT enabled) as enabled_states
FROM analytics_rules
WHERE detection_type ILIKE '%person%' OR detection_type ILIKE '%count%'
GROUP BY detection_type;

SELECT id, name, detection_type, enabled, branch_id
FROM analytics_rules
WHERE detection_type = 'person-counting';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
