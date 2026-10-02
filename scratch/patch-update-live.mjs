import { readFileSync, writeFileSync } from 'node:fs';

const path = 'deploy/gcp/update-live.sh';
let content = readFileSync(path, 'utf8');
const target = '  install -m 0644 "$RELEASE_MANIFEST_BACKUP" /opt/sentinel-grid/edge-agent/release/windows-release.json';
const replacement = '  if [ ! -s /opt/sentinel-grid/edge-agent/release/windows-release.json ]; then\n    install -m 0644 "$RELEASE_MANIFEST_BACKUP" /opt/sentinel-grid/edge-agent/release/windows-release.json\n  fi';

if (content.includes(target)) {
  content = content.replace(target, replacement);
  writeFileSync(path, content, 'utf8');
  console.log('Successfully updated deploy/gcp/update-live.sh');
} else {
  console.error('Target line not found in deploy/gcp/update-live.sh');
}
