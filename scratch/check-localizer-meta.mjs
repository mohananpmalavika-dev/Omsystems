import { execSync } from 'child_process';

const script = `
sudo docker exec sentinel-gcp-analytics-engine node -e '
  import("/app/dist/analytics-engine/src/inference/vision-model-runner.js").then(async m => {
    // Let us check what the localizer model path is and run it
    const fs = require("fs");
    const manifest = JSON.parse(fs.readFileSync("/app/models/manifest.json", "utf8"));
    const localizerMeta = manifest.models.find(x => x.id === "helmet-head-localizer");
    console.log("Localizer meta:", localizerMeta);
  });
'
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
