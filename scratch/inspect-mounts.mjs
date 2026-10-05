import { execSync } from 'child_process';

const bashScript = `
sudo docker inspect sentinel-gcp-analytics-engine --format '{{json .Mounts}}' | jq .
`;

const b64 = Buffer.from(bashScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo ${b64} | base64 -d | bash"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
