import { execSync } from 'child_process';

const ch1CameraId = '0fc5c021-4246-4659-87a0-0ba4c6f36240';
const remoteScript = `
const loginRes = await fetch("http://127.0.0.1:8080/v1/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "SentinelMasterAdmin2026!" })
});
const loginData = await loginRes.json();
const token = loginData.token || loginData.session?.token || loginData.accessToken;

const sessionRes = await fetch("http://127.0.0.1:8080/v1/cameras/${ch1CameraId}/live-sessions", {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": "Bearer " + token },
  body: JSON.stringify({ profile: "sub" })
});
console.log("Status:", sessionRes.status, await sessionRes.json());
`;

const base64 = Buffer.from(remoteScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
