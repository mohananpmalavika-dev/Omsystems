set -euo pipefail
root=/opt/sentinel-grid
release="$root/presentation-releases/20261008064447138"
image=sentinel-presentation-analytics:before-20261008064447138
echo '7a374ea55ce35e6f1c08be3128a6c49d6840305239c8973244408c2cba4aad5e  /tmp/presentation-helmet-20261008064447138.tar.gz' | sha256sum -c -
sudo mkdir -p "$release/package" "$release/backup/analytics-engine/src/detectors" "$release/backup/analytics-engine/src/inference"
sudo chmod 700 "$release" "$release/backup"
sudo tar -xzf /tmp/presentation-helmet-20261008064447138.tar.gz -C "$release/package"
sudo python3 - "$release/package" <<'PY'
import hashlib,json,pathlib,sys
p=pathlib.Path(sys.argv[1]);m=json.loads((p/'manifest.json').read_text())
for item in m['files']:
 f=(p/item['file']).resolve()
 if not f.is_relative_to(p.resolve()) or hashlib.sha256(f.read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Candidate checksum mismatch')
PY
sudo docker exec sentinel-gcp-analytics-engine node --input-type=module -e 'import fs from "node:fs";import {createHash} from "node:crypto";const hash=p=>createHash("sha256").update(fs.readFileSync(p)).digest("hex");if(hash("/app/dist/analytics-engine/src/detectors/helmet-detector.js")!=="e303a9bc20b0b77201f6cccfe85b76f5ec0a125a4f24d5c45bf77bf576576d92"||hash("/app/dist/analytics-engine/src/inference/helmet-head-verification.js")!=="e290a0f093cb62a35fcdea159416f42c568af0c13859f1881b94c85e1557783a")throw Error("Runtime changed since audit; recheck before restoring");if(hash("/app/dist/analytics-engine/src/inference/helmet-head-probe.js")!=="f23a81f5a3d1d93edaea3396f6d36789c9ade24508d8a3982031704777a2c135")throw Error("Probe changed since audit");if(hash("/app/models/safety/helmet-head-embedding.onnx")!=="583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299")throw Error("Feature model changed");'
sudo cp "$root/analytics-engine/src/detectors/helmet-detector.ts" "$release/backup/analytics-engine/src/detectors/helmet-detector.ts"
sudo cp "$root/analytics-engine/src/inference/helmet-head-verification.ts" "$release/backup/analytics-engine/src/inference/helmet-head-verification.ts"
sudo cp "$root/analytics-engine/src/inference/helmet-head-probe.ts" "$release/backup/analytics-engine/src/inference/helmet-head-probe.ts"
sudo docker commit sentinel-gcp-analytics-engine "$image" >/dev/null
sudo tee "$release/rollback.sh" >/dev/null <<'ROLLBACK'
#!/bin/bash
set -euo pipefail
root=/opt/sentinel-grid
release="$root/presentation-releases/20261008064447138"
sudo cp "$release/backup/analytics-engine/src/detectors/helmet-detector.ts" "$root/analytics-engine/src/detectors/helmet-detector.ts"
sudo cp "$release/backup/analytics-engine/src/inference/helmet-head-verification.ts" "$root/analytics-engine/src/inference/helmet-head-verification.ts"
sudo cp "$release/backup/analytics-engine/src/inference/helmet-head-probe.ts" "$root/analytics-engine/src/inference/helmet-head-probe.ts"
sudo docker tag sentinel-presentation-analytics:before-20261008064447138 sentinel-gcp-analytics-engine:latest
cd "$root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
ROLLBACK
sudo chmod 700 "$release/rollback.sh"
trap 'sudo bash "$release/rollback.sh"' ERR
printf 'FROM sentinel-presentation-analytics:before-20261008064447138\nCOPY --chown=analytics:analytics runtime/ /app/\n' | sudo tee "$release/package/Dockerfile" >/dev/null
sudo docker build -f "$release/package/Dockerfile" -t sentinel-gcp-analytics-engine:presentation-20261008064447138 "$release/package"
sudo cp "$release/package/source/analytics-engine/src/detectors/helmet-detector.ts" "$root/analytics-engine/src/detectors/helmet-detector.ts"
sudo cp "$release/package/source/analytics-engine/src/inference/helmet-head-verification.ts" "$root/analytics-engine/src/inference/helmet-head-verification.ts"
sudo cp "$release/package/source/analytics-engine/src/inference/helmet-head-probe.ts" "$root/analytics-engine/src/inference/helmet-head-probe.ts"
sudo docker tag sentinel-gcp-analytics-engine:presentation-20261008064447138 sentinel-gcp-analytics-engine:latest
cd "$root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
for tick in $(seq 1 24); do
 if sudo docker exec sentinel-gcp-analytics-engine node --input-type=module -e 'import fs from "node:fs";import {createHash} from "node:crypto";const h=await(await fetch("http://localhost:8092/health")).json();const hash=p=>createHash("sha256").update(fs.readFileSync(p)).digest("hex");if(h.aiState!=="AI_OPERATIONAL"||h.pipeline?.detectors?.helmet?.status!=="healthy"||process.env.HELMET_HEAD_EVIDENCE_CAMERAS!=="*"||hash("/app/dist/analytics-engine/src/detectors/helmet-detector.js")!=="a86568c08a29b24898bdde00bb06b93a8061cd73c8959dcbfa69d4cfc7889960"||hash("/app/dist/analytics-engine/src/inference/helmet-head-verification.js")!=="e290a0f093cb62a35fcdea159416f42c568af0c13859f1881b94c85e1557783a"||hash("/app/dist/analytics-engine/src/inference/helmet-head-probe.js")!=="88981a079a1c2645d13c3d5ca2181218f9dbcd6f76ca52acaa7299db4792e5d4")process.exit(1);console.log(JSON.stringify({aiState:h.aiState,helmet:h.pipeline.detectors.helmet,headEvidenceCameras:process.env.HELMET_HEAD_EVIDENCE_CAMERAS}));' 2>/dev/null; then
  sudo docker cp "$release/package/fixtures" "sentinel-gcp-analytics-engine:/tmp/bettiah-walking-20261008064447138"
  sudo docker exec sentinel-gcp-analytics-engine node "/tmp/bettiah-walking-20261008064447138/replay.mjs" "/tmp/bettiah-walking-20261008064447138"
  echo 'RESTORE_SUCCESS 20261008064447138'
  exit 0
 fi
 sleep 2
done
false
