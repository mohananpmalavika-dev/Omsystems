import { execSync } from 'node:child_process';

const sql = `
BEGIN;
UPDATE cameras
SET status = 'online'::camera_status,
    edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch1',
    last_seen_at = now()
WHERE id = '26c0477d-c9b3-4374-8ea8-641337d7e8c1';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '748eeb31-76f8-43e9-9121-4c1d99166e87', 'camera', '26c0477d-c9b3-4374-8ea8-641337d7e8c1',
  now(), now(), 'rtsp', 'verified', 'peravaruni-online-26c0477d-c9b3-4374-8ea8-641337d7e8c1',
  '{"fps":15,"codec":"h264","width":640,"height":360,"status":"online","severeBlur":false,"videoLoss":false,"blueScreen":false,"blackScreen":false,"colourLoss":false,"imageFrozen":false,"streamActive":true,"bitrateKbps":450,"responseTimeMs":80,"excessiveNoise":false,"packetLossPercent":0,"brightnessFailure":false,"rollingInterference":false,"obstructionSuspected":false,"cameraMovementSuspected":false}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];

COMMIT;
`;

const b64 = Buffer.from(sql).toString('base64');
execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
  { stdio: 'inherit' }
);
console.log("Updated 9th camera for Peravaruni!");
