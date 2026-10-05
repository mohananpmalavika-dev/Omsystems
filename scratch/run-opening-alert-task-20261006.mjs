import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {execSync} from 'node:child_process';
const payload = gzipSync(readFileSync(new URL('./enable-branch-opening-alerts-20261006.mjs',import.meta.url))).toString('base64');
const command = `gcloud.cmd compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${payload}' | base64 -d | gzip -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;
try {
  process.stdout.write(execSync(command,{encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024}));
} catch(error) {
  process.stdout.write(error.stdout||'');
  process.stderr.write(error.stderr||error.message);
  process.exit(1);
}
