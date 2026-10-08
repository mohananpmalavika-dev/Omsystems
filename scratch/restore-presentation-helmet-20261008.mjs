import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
const stage='tmp/presentation-helmet-safe-20261008';
const tests=JSON.parse(fs.readFileSync('reports/presentation-helmet-candidate-tests-2026-10-08.json','utf8'));
const replay=JSON.parse(fs.readFileSync('reports/presentation-helmet-replay-2026-10-08.json','utf8'));
if(!tests.success||tests.numFailedTests||tests.numTotalTests<80)throw Error('Candidate regression tests did not pass');
if(replay.summary.negativeFrames!==19||replay.summary.negativeAlertFrames!==0||replay.summary.ch4AlertFrames<1||replay.summary.ch8AlertFrames<1)
 throw Error('Walking/negative replay preflight failed');
const stamp=new Date().toISOString().replace(/[^0-9]/g,'');
const archive=stage+'/package-'+stamp+'.tar.gz';
function run(command,timeout=55000){const r=spawnSync(command,{shell:true,encoding:'utf8',timeout,maxBuffer:5*1024*1024});
 if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.status!==0)throw Error('Release command failed: '+(r.error?.message??r.status));}
run(`tar -czf ${archive} -C ${stage}/package source runtime manifest.json`);
const sha=createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
const remote=`set -euo pipefail
root=/opt/sentinel-grid
release="$root/presentation-releases/${stamp}"
image=sentinel-presentation-analytics:before-${stamp}
echo '${sha}  /tmp/presentation-helmet-${stamp}.tar.gz' | sha256sum -c -
sudo mkdir -p "$release/package" "$release/backup/analytics-engine/src/detectors" "$release/backup/analytics-engine/src/inference"
sudo chmod 700 "$release" "$release/backup"
sudo tar -xzf /tmp/presentation-helmet-${stamp}.tar.gz -C "$release/package"
sudo python3 - "$release/package" <<'PY'
import hashlib,json,pathlib,sys
p=pathlib.Path(sys.argv[1]);m=json.loads((p/'manifest.json').read_text())
for item in m['files']:
 f=(p/item['file']).resolve()
 if not f.is_relative_to(p.resolve()) or hashlib.sha256(f.read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Candidate checksum mismatch')
PY
sudo docker exec sentinel-gcp-analytics-engine node --input-type=module -e 'import fs from "node:fs";import {createHash} from "node:crypto";const hash=p=>createHash("sha256").update(fs.readFileSync(p)).digest("hex");if(hash("/app/dist/analytics-engine/src/detectors/helmet-detector.js")!=="9b0405bbfd55c33bbb942dfe3b627a730c82a902428d89c3c42d183d19f495a5"||hash("/app/dist/analytics-engine/src/inference/helmet-head-verification.js")!=="bcfde15f9bf41ec0f01c9bbbc972c3b4aec3b3c104cf4a2ae12b6ba4ac1e64cb")throw Error("Runtime changed since audit; recheck before restoring");'
sudo cp "$root/analytics-engine/src/detectors/helmet-detector.ts" "$release/backup/analytics-engine/src/detectors/helmet-detector.ts"
sudo cp "$root/analytics-engine/src/inference/helmet-head-verification.ts" "$release/backup/analytics-engine/src/inference/helmet-head-verification.ts"
sudo docker commit sentinel-gcp-analytics-engine "$image" >/dev/null
sudo tee "$release/rollback.sh" >/dev/null <<'ROLLBACK'
#!/bin/bash
set -euo pipefail
root=/opt/sentinel-grid
release="$root/presentation-releases/${stamp}"
sudo cp "$release/backup/analytics-engine/src/detectors/helmet-detector.ts" "$root/analytics-engine/src/detectors/helmet-detector.ts"
sudo cp "$release/backup/analytics-engine/src/inference/helmet-head-verification.ts" "$root/analytics-engine/src/inference/helmet-head-verification.ts"
sudo docker tag sentinel-presentation-analytics:before-${stamp} sentinel-gcp-analytics-engine:latest
cd "$root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
ROLLBACK
sudo chmod 700 "$release/rollback.sh"
trap 'sudo bash "$release/rollback.sh"' ERR
printf 'FROM sentinel-presentation-analytics:before-${stamp}\\nCOPY --chown=analytics:analytics runtime/ /app/\\n' | sudo tee "$release/package/Dockerfile" >/dev/null
sudo docker build -f "$release/package/Dockerfile" -t sentinel-gcp-analytics-engine:presentation-${stamp} "$release/package"
sudo cp "$release/package/source/analytics-engine/src/detectors/helmet-detector.ts" "$root/analytics-engine/src/detectors/helmet-detector.ts"
sudo cp "$release/package/source/analytics-engine/src/inference/helmet-head-verification.ts" "$root/analytics-engine/src/inference/helmet-head-verification.ts"
sudo docker tag sentinel-gcp-analytics-engine:presentation-${stamp} sentinel-gcp-analytics-engine:latest
cd "$root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
for tick in $(seq 1 24); do
 if sudo docker exec sentinel-gcp-analytics-engine node --input-type=module -e 'import fs from "node:fs";import {createHash} from "node:crypto";const h=await(await fetch("http://localhost:8092/health")).json();const hash=p=>createHash("sha256").update(fs.readFileSync(p)).digest("hex");if(h.aiState!=="AI_OPERATIONAL"||h.pipeline?.detectors?.helmet?.status!=="healthy"||process.env.HELMET_HEAD_EVIDENCE_CAMERAS!=="*"||hash("/app/dist/analytics-engine/src/detectors/helmet-detector.js")!=="e303a9bc20b0b77201f6cccfe85b76f5ec0a125a4f24d5c45bf77bf576576d92"||hash("/app/dist/analytics-engine/src/inference/helmet-head-verification.js")!=="448cedb3dbe673f43b51d7f4e7f38a5ff15a36c3b426f97b4be523598c44f27d")process.exit(1);console.log(JSON.stringify({aiState:h.aiState,helmet:h.pipeline.detectors.helmet,headEvidenceCameras:process.env.HELMET_HEAD_EVIDENCE_CAMERAS}));' 2>/dev/null; then
  echo 'RESTORE_SUCCESS ${stamp}'
  exit 0
 fi
 sleep 2
done
false
`;
fs.writeFileSync(stage+'/restore-'+stamp+'.sh',remote);
console.log(JSON.stringify({archive,sha256:sha,stamp,rollback:'/opt/sentinel-grid/presentation-releases/'+stamp+'/rollback.sh'}));
if(!process.argv.includes('--apply'))process.exit(0);
const cloud='--zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet';
run(`gcloud compute scp ${archive} kryptovision-server:/tmp/presentation-helmet-${stamp}.tar.gz ${cloud}`);
run(`gcloud compute ssh kryptovision-server ${cloud} --command="echo ${gzipSync(Buffer.from(remote)).toString('base64')} | base64 -d | gzip -d | bash"`,180000);
fs.writeFileSync('reports/presentation-helmet-restoration-2026-10-08.json',JSON.stringify({completedAt:new Date().toISOString(),stamp,archiveSha256:sha,rollback:'/opt/sentinel-grid/presentation-releases/'+stamp+'/rollback.sh',tests:tests.numPassedTests,replay:replay.summary},null,2));
