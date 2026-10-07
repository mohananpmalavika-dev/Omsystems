import { execSync } from 'child_process';

const script = `
sudo docker exec sentinel-gcp-analytics-engine node -e '
  import("/app/dist/analytics-engine/src/inference/configured-model-inference.js").then(async m => {
    const localizer = await m.loadObjectInference("helmet-head-localizer", 0.20);
    console.log("Localizer loaded successfully!");
  });
'
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
