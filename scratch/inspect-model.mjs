import { execSync } from 'child_process';
import fs from 'fs';

const remoteScript = `
import * as ort from 'onnxruntime-node';

async function main() {
  const session = await ort.InferenceSession.create('/tmp/helmet_yolo.onnx');
  console.log('Inputs:', session.inputNames);
  console.log('Outputs:', session.outputNames);
  
  // Inspect metadata
  const meta = session;
  console.log('Session loaded successfully');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
`;

fs.writeFileSync('scratch/inspect_model_inner.js', remoteScript);
execSync('gcloud compute scp scratch/inspect_model_inner.js kryptovision-server:/tmp/inspect_model_inner.js --zone=asia-south1-b', { stdio: 'inherit' });
execSync('gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="curl -L https://huggingface.co/raghavendra24/helmet-yolov8s/resolve/main/best.onnx -o /tmp/helmet_yolo.onnx && sudo docker cp /tmp/helmet_yolo.onnx sentinel-gcp-analytics-engine:/tmp/helmet_yolo.onnx && sudo docker cp /tmp/inspect_model_inner.js sentinel-gcp-analytics-engine:/app/inspect_model_inner.js"', { stdio: 'inherit' });
const res = execSync('gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-analytics-engine node /app/inspect_model_inner.js"');
console.log(res.toString());
