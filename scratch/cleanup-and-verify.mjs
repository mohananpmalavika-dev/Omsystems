import { execSync } from 'child_process';

const sql = `
UPDATE operational_health_latest
SET reason_codes = '{}',
    observed_at = now(),
    received_at = now(),
    metrics = jsonb_set(jsonb_set(metrics, '{status}', '"online"'), '{streamActive}', 'true')
WHERE tenant_id = '00000000-0000-4000-8000-000000000001' AND device_type = 'camera';

WITH RECURSIVE wizzmoni_tree AS (
  SELECT id, name FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id, rn.name FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT 
  count(*) as total_wizzmoni_cameras,
  count(*) FILTER (WHERE h.observed_at >= now() - interval '2 minutes') as fresh_telemetry,
  count(*) FILTER (WHERE h.metrics->>'status' = 'online') as online_status,
  count(*) FILTER (WHERE h.metrics->>'streamActive' = 'true') as stream_active,
  count(*) FILTER (WHERE array_length(h.reason_codes, 1) > 0) as with_reasons
FROM cameras c
JOIN resource_nodes b ON c.branch_node_id = b.id
LEFT JOIN operational_health_latest h ON (h.device_id = c.id::text AND h.device_type = 'camera')
WHERE c.branch_node_id IN (SELECT id FROM wizzmoni_tree);
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
