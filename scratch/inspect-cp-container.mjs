import { execSync } from 'child_process';

const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="sudo docker exec sentinel-gcp-control-plane ls -la /app/dist/src/database"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
