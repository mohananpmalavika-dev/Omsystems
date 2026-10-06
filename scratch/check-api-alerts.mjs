import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
TOKEN=$(curl -s http://127.0.0.1:8080/v1/auth/login -H "content-type: application/json" -d '{"username":"test","password":"test@123"}' | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
curl -s "http://127.0.0.1:8080/v1/alerts/command-center?limit=5" -H "authorization: Bearer $TOKEN" | jq '.data[] | {id, title, status, cameraName, branchName, createdAt}'
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --tunnel-through-iap --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
