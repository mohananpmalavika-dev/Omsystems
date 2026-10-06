import { execSync } from 'node:child_process';
import fs from 'node:fs';

const patchScript = `
const fs = require('fs');
const p = 'dist/src/routes/operational-health.routes.js';
let c = fs.readFileSync(p, 'utf8');
const target = 'if (reported === "online" || reported === "offline"';
const patch = 'if (reported === "degraded" && input.metrics.streamActive && !input.metrics.videoLoss && !input.metrics.blackScreen && !input.metrics.blueScreen && !input.metrics.imageFrozen) { reported = "online"; }\\n            ' + target;

if (!c.includes('input.metrics.streamActive') && c.includes(target)) {
  c = c.replace(target, patch);
  fs.writeFileSync(p, c);
  console.log('PATCHED CONTROL PLANE DIST SUCCESSFULLY');
} else {
  console.log('ALREADY PATCHED OR TARGET NOT FOUND');
}
`;

fs.writeFileSync('scratch/remote-patch.cjs', patchScript, 'utf8');

execSync(`scp -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no scratch/remote-patch.cjs Dhanya@34.14.220.41:/tmp/remote-patch.cjs`, { stdio: 'inherit' });

const res = execSync(`ssh -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no Dhanya@34.14.220.41 "sudo docker cp /tmp/remote-patch.cjs sentinel-gcp-control-plane:/app/remote-patch.cjs && sudo docker exec -i sentinel-gcp-control-plane node /app/remote-patch.cjs"`, { encoding: 'utf8' });
console.log(res);
