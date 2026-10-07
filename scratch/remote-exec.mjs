import { execSync } from 'child_process';

export function runRemote(cmdStr) {
  const b64 = Buffer.from(cmdStr).toString('base64');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${b64}' | base64 -d | bash"`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      if (attempt === 3) {
        return e.stdout || e.stderr || e.message;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
  }
}

if (process.argv[2]) {
  console.log(runRemote(process.argv.slice(2).join(' ')));
}
