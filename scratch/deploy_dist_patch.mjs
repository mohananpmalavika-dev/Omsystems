import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const files = [
  'dist/src/app.js',
  'dist/src/database/postgres-store.js',
  'dist/src/routes/operational-health.routes.js',
  'dist/src/operational-health/service.js',
  'dist/src/operational-health/camera-recovery.js',
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}`);
  }
}

console.log('All 5 dist files exist. Creating deployment tar...');
execSync('tar -czf scratch/control-plane-dist-patch.tar.gz dist/src/app.js dist/src/database/postgres-store.js dist/src/routes/operational-health.routes.js dist/src/operational-health/service.js dist/src/operational-health/camera-recovery.js', { stdio: 'inherit' });

console.log('Deploying to kryptovision-server...');
execSync('gcloud compute scp scratch/control-plane-dist-patch.tar.gz kryptovision-server:/tmp/ --zone=asia-south1-b', { stdio: 'inherit' });

const remoteCmd = `
sudo docker cp /tmp/control-plane-dist-patch.tar.gz sentinel-gcp-control-plane:/app/
sudo docker exec sentinel-gcp-control-plane tar -xzf /app/control-plane-dist-patch.tar.gz -C /app/
sudo docker restart sentinel-gcp-control-plane
`;

execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="${remoteCmd.replace(/\\n/g, ' && ')}"`, { stdio: 'inherit' });
console.log('Control plane restarted with patched dist files!');
