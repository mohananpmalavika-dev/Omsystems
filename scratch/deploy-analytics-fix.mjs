import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

console.log('1. Syncing latest Git repository on GCP VM...');
execSync(`gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="cd /opt/sentinel-grid && sudo git fetch origin main && sudo git reset --hard origin/main"`, { stdio: 'inherit' });

console.log('2. Packaging compiled analytics-engine dist...');
const tarPath = path.resolve('scratch/dist-deploy.tar.gz');
if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);

// Create tarball of analytics-engine/dist (covers analytics-engine, src, packages)
execSync(`tar -czf "${tarPath}" -C analytics-engine/dist .`, { stdio: 'inherit' });
const tarStats = fs.statSync(tarPath);
console.log(`Created dist archive: ${(tarStats.size / 1024).toFixed(1)} KB`);

console.log('3. Uploading dist archive to VM /tmp...');
execSync(`gcloud compute scp "${tarPath}" ${instance}:/tmp/dist-deploy.tar.gz --zone=${zone} --project=${project}`, { stdio: 'inherit' });

console.log('4. Extracting compiled code into analytics-engine container & host directory...');
const deployCmd = `
sudo mkdir -p /opt/sentinel-grid/analytics-engine/dist
sudo tar -xzf /tmp/dist-deploy.tar.gz -C /opt/sentinel-grid/analytics-engine/dist/
sudo docker exec -i sentinel-gcp-analytics-engine mkdir -p /app/dist
sudo docker exec -i sentinel-gcp-analytics-engine tar -xzf - -C /app/dist < /tmp/dist-deploy.tar.gz
rm -f /tmp/dist-deploy.tar.gz
`;
const deployBase64 = Buffer.from(deployCmd).toString('base64');
execSync(`gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo '${deployBase64}' | base64 -d | bash"`, { stdio: 'inherit' });

console.log('5. Restarting sentinel-gcp-analytics-engine container to load new code...');
execSync(`gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="sudo docker restart sentinel-gcp-analytics-engine"`, { stdio: 'inherit' });

console.log('6. Waiting 6s and verifying container health...');
execSync(`gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="sleep 6 && sudo docker ps --filter name=sentinel-gcp-analytics-engine --format 'table {{.Names}}\\t{{.Status}}' && curl -s http://localhost:8092/health"`, { stdio: 'inherit' });

if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
console.log('✅ Deployment complete and verified!');

