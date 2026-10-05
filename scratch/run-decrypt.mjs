import { execSync } from 'child_process';
import fs from 'fs';

const code = fs.readFileSync('c:/Omsystems/Omsystems/scratch/decrypt-inner.js', 'utf8');
const base64 = Buffer.from(code).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
