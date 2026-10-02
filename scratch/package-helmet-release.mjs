import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('tmp/helmet-worn-fix-2026-10-02');
const manifest = JSON.parse(await readFile('analytics-engine/models/manifest.json', 'utf8'));
const model = manifest.models.find(item => item.id === 'helmet');
assert.equal(model.preprocessor, 'imagenet-stretch');
assert.equal(model.postprocessor, 'softmax');
const files = [
  ['analytics-engine/dist/analytics-engine/src/inference/vision-specialty-inference.js', 'runtime/dist/analytics-engine/src/inference/vision-specialty-inference.js'],
  ['analytics-engine/dist/analytics-engine/src/inference/configured-model-inference.js', 'runtime/dist/analytics-engine/src/inference/configured-model-inference.js'],
  ['analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js', 'runtime/dist/analytics-engine/src/detectors/helmet-detector.js'],
  [`analytics-engine/models/${model.path}`, `runtime/models/${model.path}`],
  ['reports/helmet-worn-fix-2026-10-02.md', 'verification.md'],
  ['reports/helmet-worn-replay-2026-10-02.json', 'replay.json'],
];
const checksum = buffer => createHash('sha256').update(buffer).digest('hex');
assert.equal(checksum(await readFile(`analytics-engine/models/${model.path}`)), model.sha256);
const hashes = [];
for (const [source, target] of files) {
  const destination = path.join(root, target);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  hashes.push(`${checksum(await readFile(destination))}  ${target}`);
}
await writeFile(path.join(root, 'helmet-model.json'), JSON.stringify(model, null, 2) + '\n');
hashes.push(`${checksum(await readFile(path.join(root, 'helmet-model.json')))}  helmet-model.json`);
await writeFile(path.join(root, 'SHA256SUMS.txt'), hashes.join('\n') + '\n');
await writeFile(path.join(root, 'DEPLOYMENT.md'), `# Helmet detector 1.1.0 runtime bundle

Prepared for sentinel-gcp-analytics-engine. Production has not been modified.

1. Verify SHA256SUMS.txt. Back up the three existing runtime JS files and
   /app/models/manifest.json from the analytics container.
2. Copy runtime/ files beneath /app/ with the paths shown in this archive.
3. Replace only the id=helmet entry in the existing runtime manifest with
   helmet-model.json. Preserve all other entries and environment configuration.
   If HELMET_MODEL_PATH overrides the manifest, point it at the new artifact.
4. Restart only the analytics service and verify that /health reports the
   Motorcycle helmet head classifier as loaded and the detector as healthy.
5. Validate two independent live helmet observations on the affected camera
   and check the helmet-worn event. Replays in this bundle did not submit alerts.

Rollback: restore the backed-up JS files and manifest and restart analytics.
The prior safety/helmet.onnx is preserved by this update. Future image rebuilds
must use the updated Dockerfile and packaging script in the repository.
`);
console.log(root);
