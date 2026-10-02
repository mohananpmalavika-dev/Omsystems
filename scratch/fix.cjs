const fs = require('fs');
let s = fs.readFileSync('deploy/gcp/update-live.sh', 'utf8').replace(/\r\n/g, '\n');
const target = `if [ -n "$RELEASE_MANIFEST_BACKUP" ]; then
  install -d /opt/sentinel-grid/edge-agent/release
  if [ ! -s /opt/sentinel-grid/edge-agent/release/windows-release.json ]; then
    install -m 0644 "$RELEASE_MANIFEST_BACKUP" /opt/sentinel-grid/edge-agent/release/windows-release.json
  fi
  rm -f "$RELEASE_MANIFEST_BACKUP"
fi`;
const repl = `if [ -n "$RELEASE_MANIFEST_BACKUP" ]; then
  install -d /opt/sentinel-grid/edge-agent/release
  install -m 0644 "$RELEASE_MANIFEST_BACKUP" /opt/sentinel-grid/edge-agent/release/windows-release.json
  rm -f "$RELEASE_MANIFEST_BACKUP"
fi`;
if (!s.includes(target)) {
  console.error("target not found!");
  process.exit(1);
}
s = s.replace(target, repl);
fs.writeFileSync('deploy/gcp/update-live.sh', s);
console.log("Success!");
