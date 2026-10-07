import { execSync } from 'child_process';

const script = `
sudo docker exec sentinel-gcp-analytics-engine node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync("/app/models/manifest.json", "utf8"));
  console.log("Model IDs in manifest:", m.models.map(x => x.id));
'
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
