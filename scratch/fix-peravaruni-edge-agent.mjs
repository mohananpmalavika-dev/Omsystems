import { execSync } from 'node:child_process';

const sql = `
BEGIN;

UPDATE cameras
SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    status = 'online'::camera_status,
    last_seen_at = now()
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';

UPDATE operational_health_latest
SET metrics = jsonb_set(
      jsonb_set(metrics, '{status}', '"online"'),
      '{streamActive}', 'true'
    ),
    edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795',
    reason_codes = '{}',
    observed_at = now(),
    received_at = now()
WHERE branch_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND device_type = 'camera';

COMMIT;

SELECT id, channel, edge_agent_id, connection_secret_ref, status
FROM cameras
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61'
ORDER BY channel;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
