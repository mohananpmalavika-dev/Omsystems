import { execSync } from 'child_process';

const sql = `
SELECT id, name, hostname, version, agent_version, local_media_url, public_media_url, last_seen_at
FROM edge_agents
WHERE id = '0c88daf2-2e8c-4c5e-8831-2c90acee2af2';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-1c23cfa1-396c-4af6-864 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
