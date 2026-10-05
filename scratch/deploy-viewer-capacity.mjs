import { execSync } from 'child_process';
import fs from 'fs';

console.log('Reading files...');
const files = [
  'dashboard/components/camera-tile.tsx',
  'dashboard/lib/video/viewer-capacity-manager.ts',
];

// Let's create base64 payloads for the two files
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const b64 = Buffer.from(content).toString('base64');
  console.log(`Uploading ${file} (${content.length} bytes)...`);
  const writeCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${b64}' | base64 -d | sudo tee /opt/sentinel-grid/${file} > /dev/null"`;
  execSync(writeCmd, { stdio: 'inherit' });
}

console.log('Rebuilding dashboard on kryptovision-server...');
const buildCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="cd /opt/sentinel-grid/deploy/gcp && sudo docker compose -f docker-compose.gcp.yml build dashboard && sudo docker compose -f docker-compose.gcp.yml up -d --no-deps dashboard && sudo docker ps --filter name=sentinel-gcp-dashboard"`;
execSync(buildCmd, { stdio: 'inherit' });

console.log('Deployment complete!');
