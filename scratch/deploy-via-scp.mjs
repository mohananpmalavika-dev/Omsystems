import { execSync } from 'child_process';

const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

console.log('1. Copying updated files to VM /tmp via scp...');
execSync(`gcloud compute scp analytics-engine/src/detectors/person-detector.ts ${instance}:/tmp/person-detector.ts --zone=${zone}`, { stdio: 'inherit' });
execSync(`gcloud compute scp analytics-engine/src/detectors/helmet-detector.ts ${instance}:/tmp/helmet-detector.ts --zone=${zone}`, { stdio: 'inherit' });
execSync(`gcloud compute scp analytics-engine/src/analytics-pipeline.ts ${instance}:/tmp/analytics-pipeline.ts --zone=${zone}`, { stdio: 'inherit' });
execSync(`gcloud compute scp analytics-engine/dist/analytics-engine/src/detectors/person-detector.js ${instance}:/tmp/person-detector.js --zone=${zone}`, { stdio: 'inherit' });
execSync(`gcloud compute scp analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js ${instance}:/tmp/helmet-detector.js --zone=${zone}`, { stdio: 'inherit' });
execSync(`gcloud compute scp analytics-engine/dist/analytics-engine/src/analytics-pipeline.js ${instance}:/tmp/analytics-pipeline.js --zone=${zone}`, { stdio: 'inherit' });
execSync(`gcloud compute scp deploy/gcp/docker-compose.gcp.yml ${instance}:/tmp/docker-compose.gcp.yml --zone=${zone}`, { stdio: 'inherit' });

console.log('2. Moving files to /opt/sentinel-grid and updating container...');
const moveAndRestartCmd = `
sudo cp /tmp/person-detector.ts /opt/sentinel-grid/analytics-engine/src/detectors/person-detector.ts
sudo cp /tmp/helmet-detector.ts /opt/sentinel-grid/analytics-engine/src/detectors/helmet-detector.ts
sudo cp /tmp/analytics-pipeline.ts /opt/sentinel-grid/analytics-engine/src/analytics-pipeline.ts
sudo cp /tmp/docker-compose.gcp.yml /opt/sentinel-grid/deploy/gcp/docker-compose.gcp.yml

sudo docker cp /tmp/person-detector.js sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/detectors/person-detector.js
sudo docker cp /tmp/helmet-detector.js sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/detectors/helmet-detector.js
sudo docker cp /tmp/analytics-pipeline.js sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/analytics-pipeline.js

cd /opt/sentinel-grid/deploy/gcp
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps analytics-engine
`;

const base64 = Buffer.from(moveAndRestartCmd).toString('base64');
execSync(`gcloud compute ssh ${instance} --zone=${zone} --command="echo '${base64}' | base64 -d | bash"`, { stdio: 'inherit' });

console.log('3. Restarting analytics-engine container to reload code & env vars...');
execSync(`gcloud compute ssh ${instance} --zone=${zone} --command="sudo docker restart sentinel-gcp-analytics-engine"`, { stdio: 'inherit' });

console.log('4. Verifying container health...');
execSync(`gcloud compute ssh ${instance} --zone=${zone} --command="sleep 4 && sudo docker ps --filter name=sentinel-gcp-analytics-engine --format 'table {{.Names}}\\t{{.Status}}'"`, { stdio: 'inherit' });

console.log('Deployment complete!');
