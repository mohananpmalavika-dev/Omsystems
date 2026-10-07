import { execSync } from 'child_process';

const script = `
sudo docker exec sentinel-gcp-analytics-engine node -e '
  const fs = require("fs");
  const code = fs.readFileSync("/app/dist/analytics-engine/src/inference/helmet-head-verification.js", "utf8");
  console.log("helmet-head-verification.js size:", code.length);
  console.log("Includes candidates = objects.filter:", code.includes("objects.filter"));
  const idx = code.indexOf("candidates = objects.filter");
  if (idx !== -1) {
    console.log("Snippet around candidates filter:");
    console.log(code.substring(idx - 50, idx + 200));
  }
'
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
