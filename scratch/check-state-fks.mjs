import { execSync } from 'child_process';

const sql = `
SELECT conrelid::regclass AS table_name, confrelid::regclass AS referenced_table, pg_get_constraintdef(c.oid)
FROM pg_constraint c
WHERE confrelid = 'nbfc_rule_state'::regclass;

SELECT count(*) FROM audit_events WHERE action LIKE '%branch_opening%';
SELECT id, action, outcome, created_at, details FROM audit_events WHERE action LIKE '%branch_opening%' ORDER BY created_at DESC LIMIT 5;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
