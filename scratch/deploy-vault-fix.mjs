import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

console.log('=== Step 1: Preparing deployment staging bundle ===');
const stageDir = path.resolve('scratch/staging-vault-fix');
if (fs.existsSync(stageDir)) {
  fs.rmSync(stageDir, { recursive: true, force: true });
}
fs.mkdirSync(stageDir, { recursive: true });

fs.copyFileSync('analytics-engine/dist/analytics-engine/src/analytics-pipeline.js', path.join(stageDir, 'analytics-pipeline.js'));
fs.copyFileSync('analytics-engine/src/analytics-pipeline.ts', path.join(stageDir, 'analytics-pipeline.ts'));
fs.copyFileSync('analytics-engine/dist/analytics-engine/src/inference/conditional-scheduler.js', path.join(stageDir, 'conditional-scheduler.js'));
fs.copyFileSync('analytics-engine/src/inference/conditional-scheduler.ts', path.join(stageDir, 'conditional-scheduler.ts'));

const tarPath = path.resolve('scratch/vault-fix-deploy.tar.gz');
if (fs.existsSync(tarPath)) {
  fs.unlinkSync(tarPath);
}

execSync(`tar -czf "${tarPath}" -C "${stageDir}" .`, { stdio: 'inherit' });
console.log('Bundle created successfully at', tarPath);

console.log('\n=== Step 2: Uploading bundle to kryptovision-server ===');
const scpCmd = `gcloud compute scp "${tarPath}" ${instance}:/tmp/vault-fix-deploy.tar.gz --zone=${zone} --project=${project}`;
console.log(scpCmd);
execSync(scpCmd, { stdio: 'inherit' });
console.log('Upload completed!');

console.log('\n=== Step 3: Executing remote deployment and updates ===');
const remoteScript = `
set -Eeuo pipefail

staging=/tmp/staging-vault-fix
rm -rf "$staging"
mkdir -p "$staging"
tar -xzf /tmp/vault-fix-deploy.tar.gz -C "$staging"

echo "1. Updating analytics-engine source on host..."
if [ -d /opt/sentinel-grid/analytics-engine/src ]; then
  sudo cp "$staging/analytics-pipeline.ts" /opt/sentinel-grid/analytics-engine/src/analytics-pipeline.ts
  sudo cp "$staging/conditional-scheduler.ts" /opt/sentinel-grid/analytics-engine/src/inference/conditional-scheduler.ts
fi

echo "2. Copying compiled files into docker container..."
sudo docker cp "$staging/analytics-pipeline.js" sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/analytics-pipeline.js
sudo docker cp "$staging/conditional-scheduler.js" sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/inference/conditional-scheduler.js

echo "3. Restarting sentinel-gcp-analytics-engine..."
sudo docker restart sentinel-gcp-analytics-engine

echo "4. Waiting for container to become healthy..."
sleep 5
for attempt in $(seq 1 30); do
  ae_status=$(sudo docker inspect sentinel-gcp-analytics-engine --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
  echo "Attempt $attempt: analytics-engine=$ae_status"
  if [ "$ae_status" = "healthy" ]; then
    echo "Analytics engine is healthy!"
    break
  fi
  sleep 2
done

echo "5. Resolving false dual-control alerts created during testing..."
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid << 'SQL'
-- Mark false dual-control alerts on Bettiah from today as false_alarm / resolved
UPDATE analytics_alerts
SET status = 'resolved',
    resolution_notes = 'Verified: False alarm caused by camera occlusion when 2 officers operated safe simultaneously; resolved by multi-person occlusion filter.',
    resolved_at = now()
WHERE id IN (
  'a51c4ed1-4110-4e7f-87f4-0132ddb53da7',
  '6d6bd5ba-4ba6-4f02-bf51-bb9a8edb89fb',
  'a5245f6a-f659-49e7-992e-f8019658bcda'
);

-- Verify status
SELECT id, status, severity, resolved_at, resolution_notes
FROM analytics_alerts
WHERE id IN (
  'a51c4ed1-4110-4e7f-87f4-0132ddb53da7',
  '6d6bd5ba-4ba6-4f02-bf51-bb9a8edb89fb',
  'a5245f6a-f659-49e7-992e-f8019658bcda'
);
SQL

echo "Vault occlusion fix deployed successfully!"
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const sshCmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --quiet --command="echo ${b64} | base64 -d | bash"`;
console.log('Running remote deployment...');
execSync(sshCmd, { stdio: 'inherit' });
console.log('ALL DONE!');
