import { execSync } from 'child_process';

const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="sudo docker exec sentinel-gcp-control-plane sed -n '35,55p' /app/dist/src/database/device-identity-repository.js"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
