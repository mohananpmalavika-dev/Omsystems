import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const content = readFileSync('media-gateway/mediamtx.yml', 'utf8');
const base64 = Buffer.from(content).toString('base64');

console.log('Deploying mediamtx.yml to sentinel-gcp-media-gateway...');
execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -u 0 -i sentinel-gcp-media-gateway sh -c 'cat > /app/media-gateway/mediamtx.yml' && sudo docker restart sentinel-gcp-media-gateway"`
);
console.log('sentinel-gcp-media-gateway updated and restarted successfully.');
