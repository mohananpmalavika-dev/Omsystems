import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

console.log('=== Step 1: Preparing deployment staging bundle ===');
const stageDir = path.resolve('scratch/staging-dual-control');
if (fs.existsSync(stageDir)) {
  fs.rmSync(stageDir, { recursive: true, force: true });
}
fs.mkdirSync(stageDir, { recursive: true });

fs.copyFileSync('analytics-engine/dist/analytics-engine/src/analytics-pipeline.js', path.join(stageDir, 'analytics-pipeline.js'));
fs.copyFileSync('analytics-engine/src/analytics-pipeline.ts', path.join(stageDir, 'analytics-pipeline.ts'));
fs.copyFileSync('dist/src/analytics/rule-engine.js', path.join(stageDir, 'rule-engine.js'));
fs.copyFileSync('src/analytics/rule-engine.ts', path.join(stageDir, 'rule-engine.ts'));

const tarPath = path.resolve('scratch/dual-control-deploy.tar.gz');
if (fs.existsSync(tarPath)) {
  fs.unlinkSync(tarPath);
}

execSync(`tar -czf "${tarPath}" -C "${stageDir}" .`, { stdio: 'inherit' });
console.log('Bundle created successfully at', tarPath);

console.log('\n=== Step 2: Uploading bundle to kryptovision-server ===');
const scpCmd = `gcloud compute scp "${tarPath}" ${instance}:/tmp/dual-control-deploy.tar.gz --zone=${zone} --project=${project}`;
console.log(scpCmd);
execSync(scpCmd, { stdio: 'inherit' });
console.log('Upload completed!');

console.log('\n=== Step 3: Executing remote deployment and updates ===');
const remoteScript = `
set -Eeuo pipefail

staging=/tmp/staging-dual-control
rm -rf "$staging"
mkdir -p "$staging"
tar -xzf /tmp/dual-control-deploy.tar.gz -C "$staging"

echo "1. Updating analytics-engine source on host..."
if [ -d /opt/sentinel-grid/analytics-engine/src ]; then
  sudo cp "$staging/analytics-pipeline.ts" /opt/sentinel-grid/analytics-engine/src/analytics-pipeline.ts
fi

echo "2. Updating control-plane source on host..."
if [ -d /opt/sentinel-grid/src/analytics ]; then
  sudo cp "$staging/rule-engine.ts" /opt/sentinel-grid/src/analytics/rule-engine.ts
fi

echo "3. Copying compiled files into docker containers..."
sudo docker cp "$staging/analytics-pipeline.js" sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/analytics-pipeline.js
sudo docker cp "$staging/rule-engine.js" sentinel-gcp-control-plane:/app/dist/src/analytics/rule-engine.js

echo "4. Restarting containers..."
sudo docker restart sentinel-gcp-analytics-engine
sudo docker restart sentinel-gcp-control-plane

echo "5. Waiting for containers to become healthy..."
sleep 5
for attempt in $(seq 1 30); do
  ae_status=$(sudo docker inspect sentinel-gcp-analytics-engine --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
  cp_status=$(sudo docker inspect sentinel-gcp-control-plane --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
  echo "Attempt $attempt: analytics-engine=$ae_status, control-plane=$cp_status"
  if [ "$ae_status" = "healthy" ] && [ "$cp_status" = "healthy" ]; then
    echo "Both containers healthy!"
    break
  fi
  sleep 2
done

echo "6. Updating database rules in sentinel-gcp-postgres..."
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid << 'SQL'
-- First, disable dual-control-verification on all cameras to prevent false alarms on non-vault cameras
UPDATE analytics_rules
SET enabled = false, updated_at = now()
WHERE detection_type = 'dual-control-verification';

-- Now explicitly enable dual-control-verification on the 5 vault area cameras
UPDATE analytics_rules
SET enabled = true, updated_at = now()
WHERE detection_type = 'dual-control-verification'
  AND camera_id IN (
    '699e8b00-cfac-4a22-b0f5-802c95f68431', -- Bettaih Ch 1
    '88137ebc-8df1-4995-824a-99bfce6c2225', -- Hajipur Ch 6
    '3da93c6e-6824-43dc-9bba-7332707d5856', -- KOLLAM Ch 4
    '3baa601f-67e0-4e0e-905d-0688df725bf1', -- PERAVARUNI Ch 7
    '4d74d7ad-6922-4af0-9f36-420b84879425'  -- Rajkot Ch 8
  );

-- Enable nbfc dual-control rule template
UPDATE nbfc_analytics_rules
SET enabled = true,
    state = 'ACTIVE',
    camera_ids = '["699e8b00-cfac-4a22-b0f5-802c95f68431", "88137ebc-8df1-4995-824a-99bfce6c2225", "3da93c6e-6824-43dc-9bba-7332707d5856", "3baa601f-67e0-4e0e-905d-0688df725bf1", "4d74d7ad-6922-4af0-9f36-420b84879425"]'::jsonb,
    branch_ids = '["d7b23dee-9814-48c9-8805-48b61b33e3a9", "921d336d-baa9-4b25-9f9f-f6542bba94cc", "525198ad-504d-48af-ac6c-dca057d38ed5", "d8467a57-dae8-4012-ba5e-c3254075aa61", "6ddee070-9050-4f55-aaa1-1190654bbc6b"]'::jsonb,
    updated_at = now()
WHERE template_id = 'tmpl-02-minimum-personnel';

-- Verify enabled dual-control rules
SELECT ar.id, ar.detection_type, ar.enabled, c.channel, rn.name as camera_name, b.name as branch_name
FROM analytics_rules ar
JOIN cameras c ON ar.camera_id = c.id
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
WHERE ar.detection_type = 'dual-control-verification' AND ar.enabled = true
ORDER BY b.name;
SQL

echo "Deployment completed successfully!"
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const sshCmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --quiet --command="echo ${b64} | base64 -d | bash"`;
console.log('Running remote deployment...');
execSync(sshCmd, { stdio: 'inherit' });
console.log('ALL DONE!');
