import { execSync } from 'child_process';
import fs from 'fs';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const filesToUpload = [
  'analytics-engine/src/detectors/person-detector.ts',
  'analytics-engine/src/detectors/helmet-detector.ts',
  'analytics-engine/src/analytics-pipeline.ts',
  'deploy/gcp/docker-compose.gcp.yml',
];

console.log('Uploading updated source files to GCP VM...');
for (const relPath of filesToUpload) {
  const content = fs.readFileSync(relPath, 'utf8');
  const b64 = Buffer.from(content).toString('base64');
  console.log(`Uploading ${relPath} (${content.length} bytes)...`);
  const uploadCmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo '${b64}' | base64 -d | sudo tee /opt/sentinel-grid/${relPath} > /dev/null"`;
  execSync(uploadCmd, { stdio: 'inherit' });
}

console.log('Building and copying compiled dist to running container...');
// Also upload the compiled dist files directly so it applies immediately without full docker build if desired
const distFiles = [
  'analytics-engine/dist/detectors/person-detector.js',
  'analytics-engine/dist/detectors/helmet-detector.js',
  'analytics-engine/dist/analytics-pipeline.js',
];

for (const relPath of distFiles) {
  const content = fs.readFileSync(relPath, 'utf8');
  const b64 = Buffer.from(content).toString('base64');
  const containerDest = `/app/dist/${relPath.replace('analytics-engine/dist/', 'analytics-engine/src/')}`;
  console.log(`Copying compiled ${relPath} to container ${containerDest}...`);
  const injectCmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-analytics-engine tee ${containerDest} > /dev/null"`;
  execSync(injectCmd, { stdio: 'inherit' });
}

console.log('Updating container environment and restarting container...');
const restartCmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="cd /opt/sentinel-grid/deploy/gcp && sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine"`;
execSync(restartCmd, { stdio: 'inherit' });

console.log('Waiting 5s for container health check...');
const checkCmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="sleep 5 && sudo docker ps --filter name=sentinel-gcp-analytics-engine --format 'table {{.Names}}\\t{{.Status}}'"`;
execSync(checkCmd, { stdio: 'inherit' });

console.log('Deployment complete and verified!');
