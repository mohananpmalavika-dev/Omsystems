import { execSync } from 'child_process';

const script = `
sudo docker exec sentinel-gcp-analytics-engine node -e '
  import("/app/dist/analytics-engine/src/inference/configured-model-inference.js").then(async m => {
    try {
      const face = await m.loadObjectInference("face-detector", 0.6);
      console.log("Face detector loaded:", Boolean(face));
    } catch (e) {
      console.log("Face detector error:", e.message);
    }
    try {
      const pose = await m.loadPoseInference("pose-estimator", 0.4);
      console.log("Pose estimator loaded:", Boolean(pose));
    } catch (e) {
      console.log("Pose estimator error:", e.message);
    }
  });
'
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
