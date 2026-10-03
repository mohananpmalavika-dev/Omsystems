import { execSync } from 'child_process';

const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker logs --tail 30 sentinel-gcp-analytics-engine"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
