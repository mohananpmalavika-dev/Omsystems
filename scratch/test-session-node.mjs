import { execSync } from 'child_process';

const code = `
async function test() {
  const res = await fetch('http://127.0.0.1:8080/v1/cameras/2e12f799-5135-4127-ab71-5fa2980ccb0f/live-sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: 'sub' })
  });
  console.log('Status:', res.status);
  console.log('Response:', await res.json());
}
test().catch(console.error);
`;

const base64 = Buffer.from(code).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
