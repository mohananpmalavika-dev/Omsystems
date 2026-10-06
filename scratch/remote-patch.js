
const fs = require('fs');
const p = 'dist/src/routes/operational-health.routes.js';
let c = fs.readFileSync(p, 'utf8');
const target = 'if (reported === "online" || reported === "offline"';
const patch = 'if (reported === "degraded" && input.metrics.streamActive && !input.metrics.videoLoss && !input.metrics.blackScreen && !input.metrics.blueScreen && !input.metrics.imageFrozen) { reported = "online"; }\n            ' + target;

if (!c.includes('input.metrics.streamActive') && c.includes(target)) {
  c = c.replace(target, patch);
  fs.writeFileSync(p, c);
  console.log('PATCHED CONTROL PLANE DIST SUCCESSFULLY');
} else {
  console.log('ALREADY PATCHED OR TARGET NOT FOUND');
}
