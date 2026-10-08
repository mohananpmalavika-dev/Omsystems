import { execSync } from 'child_process';

const code = `
import { getStore } from '/app/dist/src/store.js';
const store = getStore();
const cams = await store.listMonitoringCamerasForEdgeAgent('b950f232-557e-42cd-8bc8-8f4490d0b68b');
console.log('COUNT:', cams.length);
console.log(JSON.stringify(cams.map(c => ({ id: c.id, channel: c.channel, name: c.name, secret: c.connectionSecretRef })), null, 2));
`;

const b64 = Buffer.from(code).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node -"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
