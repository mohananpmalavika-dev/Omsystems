import { execSync } from 'child_process';

const zone = 'asia-south1-b';
const project = 'project-7866fc3f-5dd5-4495-804';
const instance = 'kryptovision-server';

console.log('1. Copying updated files to VM /tmp via scp...');
execSync(`gcloud compute scp analytics-engine/src/detectors/helmet-detector.ts ${instance}:/tmp/helmet-detector.ts --zone=${zone} --project=${project}`, { stdio: 'inherit' });
execSync(`gcloud compute scp analytics-engine/src/inference/helmet-head-verification.ts ${instance}:/tmp/helmet-head-verification.ts --zone=${zone} --project=${project}`, { stdio: 'inherit' });
execSync(`gcloud compute scp analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js ${instance}:/tmp/helmet-detector.js --zone=${zone} --project=${project}`, { stdio: 'inherit' });
execSync(`gcloud compute scp analytics-engine/dist/analytics-engine/src/inference/helmet-head-verification.js ${instance}:/tmp/helmet-head-verification.js --zone=${zone} --project=${project}`, { stdio: 'inherit' });

console.log('2. Updating source on host and copying into container...');
const remoteCmd = `
sudo cp /tmp/helmet-detector.ts /opt/sentinel-grid/analytics-engine/src/detectors/helmet-detector.ts || true
sudo cp /tmp/helmet-head-verification.ts /opt/sentinel-grid/analytics-engine/src/inference/helmet-head-verification.ts || true
sudo docker cp /tmp/helmet-detector.js sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/detectors/helmet-detector.js
sudo docker cp /tmp/helmet-head-verification.js sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/inference/helmet-head-verification.js
sudo docker exec sentinel-gcp-analytics-engine node --check /app/dist/analytics-engine/src/detectors/helmet-detector.js
sudo docker exec sentinel-gcp-analytics-engine node --check /app/dist/analytics-engine/src/inference/helmet-head-verification.js
echo "Syntax check OK inside container!"
`;
const b64 = Buffer.from(remoteCmd).toString('base64');
execSync(`gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo '${b64}' | base64 -d | bash"`, { stdio: 'inherit' });

console.log('3. Restarting sentinel-gcp-analytics-engine container...');
execSync(`gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="sudo docker restart sentinel-gcp-analytics-engine"`, { stdio: 'inherit' });

console.log('4. Waiting for container to become healthy...');
const healthCheckScript = `
for i in $(seq 1 30); do
  if sudo docker exec sentinel-gcp-analytics-engine node -e '
    fetch("http://localhost:8092/health").then(r => r.json()).then(h => {
      if (h.aiState === "AI_OPERATIONAL" && h.pipeline?.detectors?.helmet?.status === "healthy") {
        console.log("HEALTH_OK:", JSON.stringify({ aiState: h.aiState, helmet: h.pipeline?.detectors?.helmet }));
        process.exit(0);
      }
      process.exit(1);
    }).catch(() => process.exit(1));
  ' 2>/dev/null; then
    echo "Analytics engine is healthy!"
    exit 0
  fi
  sleep 2
done
echo "Timeout waiting for health"
exit 1
`;
const healthB64 = Buffer.from(healthCheckScript).toString('base64');
execSync(`gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo '${healthB64}' | base64 -d | bash"`, { stdio: 'inherit' });

console.log('Deployment complete and healthy!');
