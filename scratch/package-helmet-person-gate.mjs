import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('tmp/helmet-person-gate-2026-10-03');
const source = 'analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js';
const detector = await readFile(source);
assert.match(detector.toString(), /super\("helmet", "1\.1\.1"\)/);
assert.match(detector.toString(), /CLASSIFIED_PERSON_CONFIDENCE = 0\.9/);
await mkdir(root, { recursive: true });
await copyFile(source, path.join(root, 'helmet-detector.js'));
const checksum = createHash('sha256').update(detector).digest('hex');
await writeFile(path.join(root, 'SHA256SUMS.txt'), `${checksum}  helmet-detector.js\n`);
await copyFile('reports/helmet-incident-snapshots-replay-2026-10-03.json', path.join(root, 'replay.json'));
await copyFile('reports/helmet-incident-snapshots-fix-2026-10-03.md', path.join(root, 'verification.md'));
await writeFile(path.join(root, 'DEPLOYMENT.md'), `# Detector-only update: helmet 1.1.0 -> 1.1.1

Target: kryptovision-server, asia-south1-b; sentinel-gcp-analytics-engine.
Production remains unchanged until this update is approved and applied.

1. Verify SHA256SUMS.txt and upload helmet-detector.js to a new host staging directory.
2. Back up /app/dist/analytics-engine/src/detectors/helmet-detector.js from the container to that host directory before replacing it.
3. Copy the new detector into the same container path, verify its SHA-256 (${checksum}), and run node --check on it.
4. Restart only sentinel-gcp-analytics-engine. Wait for /live and /health on port 8092; verify the helmet detector is healthy and the strong person-evidence check is active.
5. Verify no new false helmet events on the affected cameras. Static replays did not submit production events.

Rollback: copy the original detector from the host backup to its original container path, then restart only analytics and check health.

The runtime patch must also be included in the next analytics image rebuild using repository version 1.1.1; container recreation removes a runtime-only copy.
`);
console.log(JSON.stringify({ directory: root, detectorVersion: '1.1.1', sha256: checksum }));
