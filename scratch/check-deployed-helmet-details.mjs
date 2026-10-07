import { execSync } from 'child_process';

const script = `
sudo docker exec sentinel-gcp-analytics-engine node -e '
  const fs = require("fs");
  const code = fs.readFileSync("/app/dist/analytics-engine/src/detectors/helmet-detector.js", "utf8");
  console.log("Helmet detector file length:", code.length);
  const match = code.match(/super\\("helmet",\\s*"([^"]+)"\\)/);
  console.log("Version:", match ? match[1] : "unknown");
  console.log("Has fastAlert:", code.includes("fastAlert"));
  console.log("Has verifyDirect:", code.includes("verifyDirect"));
  console.log("Has shouldRunLocalSpecialtyInference:", code.includes("shouldRunLocalSpecialtyInference"));
'
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
