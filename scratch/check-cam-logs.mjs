import { execSync } from 'child_process';

const script = `
sudo docker exec sentinel-gcp-redis redis-cli -a SentinelGridRedisMaster2026 keys 'analytics:latest-frame:*'
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${b64}' | base64 -d | bash"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
