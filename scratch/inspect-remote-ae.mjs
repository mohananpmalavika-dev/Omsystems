import { execSync } from 'child_process';

const bashScript = `
sudo docker exec sentinel-gcp-analytics-engine grep -n 'super("helmet"' /app/dist/analytics-engine/src/detectors/helmet-detector.js
sudo docker exec sentinel-gcp-analytics-engine cat /app/dist/analytics-engine/src/detectors/helmet-detector.js | grep -n 'evidenceSource'
curl -s http://localhost:8092/health | jq .
`;

const b64 = Buffer.from(bashScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${b64} | base64 -d | bash"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
