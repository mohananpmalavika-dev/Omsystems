import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

console.log('--- Step 1: Staging files for deployment ---');
const stagingDir = path.resolve('scratch/staging-helmet-multi-model');
fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(path.join(stagingDir, 'src/detectors'), { recursive: true });
fs.mkdirSync(path.join(stagingDir, 'src/inference'), { recursive: true });
fs.mkdirSync(path.join(stagingDir, 'dist/detectors'), { recursive: true });
fs.mkdirSync(path.join(stagingDir, 'dist/inference'), { recursive: true });

fs.copyFileSync(
  path.resolve('analytics-engine/src/detectors/helmet-detector.ts'),
  path.join(stagingDir, 'src/detectors/helmet-detector.ts')
);
fs.copyFileSync(
  path.resolve('analytics-engine/src/inference/helmet-head-verification.ts'),
  path.join(stagingDir, 'src/inference/helmet-head-verification.ts')
);
fs.copyFileSync(
  path.resolve('analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js'),
  path.join(stagingDir, 'dist/detectors/helmet-detector.js')
);
fs.copyFileSync(
  path.resolve('analytics-engine/dist/analytics-engine/src/inference/helmet-head-verification.js'),
  path.join(stagingDir, 'dist/inference/helmet-head-verification.js')
);

console.log('--- Step 2: Creating tarball ---');
const tarPath = path.resolve('scratch/helmet-multi-model.tar.gz');
execSync(`tar -czf "${tarPath}" -C "${stagingDir}" .`, { stdio: 'inherit' });
console.log(`Created ${tarPath}`);

console.log('\n--- Step 3: Uploading tarball to GCP kryptovision-server ---');
const scpCmd = `gcloud compute scp "${tarPath}" ${instance}:/tmp/helmet-multi-model.tar.gz --zone=${zone} --project=${project}`;
console.log(scpCmd);
execSync(scpCmd, { stdio: 'inherit' });
console.log('Upload successful!');

console.log('\n--- Step 4: Executing remote deployment script on kryptovision-server ---');
const deployScript = `
set -Eeuo pipefail
stage=/tmp/sentinel-helmet-multi-model-deploy
rm -rf "$stage"
mkdir -p "$stage"
tar xzf /tmp/helmet-multi-model.tar.gz -C "$stage"

source_root=/opt/sentinel-grid

echo "Backing up current files..."
backup_dir="/tmp/sentinel-helmet-backup-\$(date +%s)"
mkdir -p "$backup_dir"
cp "$source_root/analytics-engine/src/detectors/helmet-detector.ts" "$backup_dir/" || true
cp "$source_root/analytics-engine/src/inference/helmet-head-verification.ts" "$backup_dir/" || true

echo "Updating source TypeScript files..."
sudo cp "$stage/src/detectors/helmet-detector.ts" "$source_root/analytics-engine/src/detectors/helmet-detector.ts"
sudo cp "$stage/src/inference/helmet-head-verification.ts" "$source_root/analytics-engine/src/inference/helmet-head-verification.ts"

target=sentinel-gcp-analytics-engine
image_tag=$(sudo docker inspect "$target" --format '{{.Config.Image}}')
candidate=sentinel-gcp-analytics-engine:helmet-multi-model-\$(date +%Y%m%d%H%M%S)

echo "Building candidate container image with multi-model verification..."
cat << 'DOCKERFILE' > "$stage/Dockerfile"
FROM sentinel-gcp-analytics-engine:latest
COPY dist/detectors/helmet-detector.js /app/dist/analytics-engine/src/detectors/helmet-detector.js
COPY dist/inference/helmet-head-verification.js /app/dist/analytics-engine/src/inference/helmet-head-verification.js
DOCKERFILE

sudo docker build -t "$candidate" "$stage"
sudo docker tag "$candidate" "$image_tag"

echo "Recreating analytics engine container..."
cd "$source_root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine

echo "Waiting for health check..."
ready=false
for attempt in $(seq 1 30); do
  if sudo docker exec "$target" node --input-type=module -e 'const h=await(await fetch("http://localhost:8092/health")).json();if(h.aiState!=="AI_OPERATIONAL"||h.pipeline?.detectors?.helmet?.status!=="healthy")process.exit(1);console.log(JSON.stringify({aiState:h.aiState,helmet:h.pipeline.detectors.helmet}));' 2>/dev/null; then
    ready=true
    break
  fi
  echo "Attempt $attempt: waiting 2s..."
  sleep 2
done

if [ "$ready" != "true" ]; then
  echo "ERROR: Analytics engine failed to become healthy!"
  sudo docker logs --tail 50 "$target"
  exit 1
fi

echo "Deploy completed."


echo "SUCCESS! Multi-model helmet verification (Pose + Face + Helmet Localizer) is LIVE and verified."
`;

const b64 = Buffer.from(deployScript).toString('base64');
const sshCmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log('Running remote deployment...');
execSync(sshCmd, { stdio: 'inherit' });
console.log('Deployment completed successfully!');
