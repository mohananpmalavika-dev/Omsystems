import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const OLD_IP = '34.14.220.41';
const NEW_IP = '35.200.130.81';
const OLD_DOMAIN = '34-14-220-41';
const NEW_DOMAIN = '35-200-130-81';

const targetFiles = [
  'dashboard/.env.local',
  'dashboard/.env.production',
  'dashboard/scripts/diagnose-maintenance-api.ts',
  'deploy/gcp/Caddyfile',
  'deploy/gcp/docker-compose.gcp.yml',
  'docker-compose.production.yml',
  'edge-agent/installer/windows/sentinel-grid.iss',
  'edge-agent/run-edge-agent.env',
  'edge-agent/run-v38-live.env',
  'edge-agent/run-v38.env',
  'scripts/auto-fleet-rollout.mjs',
  'scratch/apply-and-verify-kollam-live.mjs',
  'scratch/audit-south-zone-final.mjs',
  'scratch/build-helmet-edge-update-2026-10-04.ts',
  'scratch/build-storage-delta.mjs',
  'scratch/capture-both-frames.mjs',
  'scratch/capture-per-frames.mjs',
  'scratch/check-api-cameras.mjs',
  'scratch/check-assignment-cols.mjs',
  'scratch/check-branch-creds.mjs',
  'scratch/check-camera-cols.mjs',
  'scratch/check-control-room.mjs',
  'scratch/check-edge-agents-list.mjs',
  'scratch/check-gateways.mjs',
  'scratch/check-hajipur-cameras.mjs',
  'scratch/check-health-cols.mjs',
  'scratch/check-health-details.mjs',
  'scratch/check-kollam-status.mjs',
  'scratch/check-latest-telemetry.mjs',
  'scratch/check-live-ui.mjs',
  'scratch/check-live.mjs',
  'scratch/check-telemetry-cols.mjs',
  'scratch/check-uuid-refs.mjs',
  'scratch/compare-hosts.mjs',
  'scratch/connect-peravaruni-live.mjs',
  'scratch/debug-peravaruni-ch2.mjs',
  'scratch/deploy-installer-fix.sh',
  'scratch/diagnose-black-recording.ts',
  'scratch/diagnose-blank-cameras.mjs',
  'scratch/diagnose-device-archive.ts',
  'scratch/dump-nav.mjs',
  'scratch/enable-all-hajipur-channels.mjs',
  'scratch/find-all-working-channels.mjs',
  'scratch/fix-all-branch-cameras.mjs',
  'scratch/fix-all-kollam-live.mjs',
  'scratch/fix-and-test-kollam.mjs',
  'scratch/fix-and-test-peravaruni.mjs',
  'scratch/fix-pera-ch4.mjs',
  'scratch/fix-test-password.mjs',
  'scratch/insert_release.sql',
  'scratch/inspect-video-player.mjs',
  'scratch/list-32-cameras.mjs',
  'scratch/map-channels.mjs',
  'scratch/patch-control-plane.mjs',
  'scratch/test-40-live.mjs',
  'scratch/test-5-6-7.mjs',
  'scratch/test-55-stream.mjs',
  'scratch/test-6-cams.mjs',
  'scratch/test-all-40-cameras-ffmpeg.mjs',
  'scratch/test-all-creds.mjs',
  'scratch/test-all-live.mjs',
  'scratch/test-bettaih-ch2.mjs',
  'scratch/test-branch-streams.mjs',
  'scratch/test-capture.mjs',
  'scratch/test-ch1-direct.mjs',
  'scratch/test-ch1-fix.mjs',
  'scratch/test-ch1.mjs',
  'scratch/test-ch2-ch3.mjs',
  'scratch/test-ch2-match.mjs',
  'scratch/test-ch2-retry.mjs',
  'scratch/test-ch2.mjs',
  'scratch/test-ch7.mjs',
  'scratch/test-ch9-solo.mjs',
  'scratch/test-fleet-live.mjs',
  'scratch/test-gateway-stream.mjs',
  'scratch/test-hajipur-ch1-live.mjs',
  'scratch/test-hajipur-live.mjs',
  'scratch/test-jwt-call.mjs',
  'scratch/test-kollam-details.mjs',
  'scratch/test-kollam-live.mjs',
  'scratch/test-kollam-via-748e.mjs',
  'scratch/test-kollam-via-839d.mjs',
  'scratch/test-live-channels.cjs',
  'scratch/test-live-north.mjs',
  'scratch/test-login-gcp.mjs',
  'scratch/test-media-mtx.mjs',
  'scratch/test-one-camera.mjs',
  'scratch/test-pera-91.mjs',
  'scratch/test-pera-agent.mjs',
  'scratch/test-pera-ch1.mjs',
  'scratch/test-pera-haji-live.mjs',
  'scratch/test-pera-live-all.mjs',
  'scratch/test-peravaruni-ch1-ch8.mjs',
  'scratch/test-peravaruni-live.mjs',
  'scratch/test-pilot-live.mjs',
  'scratch/test-rajkot-live-relay.mjs',
  'scratch/test-remote-login.mjs',
  'scratch/test-retry-live.mjs',
  'scratch/test-south-zone-live.mjs',
  'scratch/test-wizzmoni-cameras-status.mjs',
  'scratch/test-wizzmoni-ui.mjs',
  'scratch/update-test-password.mjs',
  'scratch/verify-40-breakdown.mjs',
  'scratch/verify-all-32-live.mjs',
  'scratch/verify-all-40-cameras-working.mjs',
  'scratch/verify-all-40-final.mjs',
  'scratch/verify-all-8-live.mjs',
  'scratch/verify-all-hajipur-live.mjs',
  'scratch/verify-and-publish-recorder-storage.ts',
  'scratch/verify-api-40.mjs',
  'scratch/verify-both-streams.mjs',
  'scratch/verify-hajipur-8channels.mjs',
  'scratch/verify-kollam-streams-only.mjs',
  'scratch/verify-live-limit-144.sh',
  'scratch/verify-main-profile.mjs',
  'scratch/verify-per-kol.mjs',
  'scratch/verify-pera-all.mjs',
  'scratch/verify-recording-playback-live.cjs'
];

let updatedCount = 0;
for (const rel of targetFiles) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) {
    console.warn(`File does not exist: ${rel}`);
    continue;
  }
  let content = fs.readFileSync(full, 'utf8');
  let changed = false;

  if (content.includes(OLD_IP)) {
    content = content.replaceAll(OLD_IP, NEW_IP);
    changed = true;
  }
  if (content.includes(OLD_DOMAIN)) {
    content = content.replaceAll(OLD_DOMAIN, NEW_DOMAIN);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(full, content, 'utf8');
    updatedCount++;
    console.log(`Updated: ${rel}`);
  }
}

console.log(`\nSuccessfully updated ${updatedCount} files.`);
