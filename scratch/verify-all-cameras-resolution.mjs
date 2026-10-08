import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const py = `
import urllib.request, json

req = urllib.request.urlopen('http://127.0.0.1:8080/v1/edge-agents/9f108498-4dd5-4a21-b810-eec9e538953c/cameras/monitoring')
data = json.loads(req.read().decode('utf-8'))

for cam in data.get('data', []):
    print(f"Cam: {cam.get('id')} | Channel: {cam.get('recorderChannel') or cam.get('channel')} | Res: {cam.get('analyticsResolution')}")
`;

const script = 'sudo python3 -c "import base64;exec(base64.b64decode(\'' + Buffer.from(py).toString('base64') + '\'))"';
const command = 'echo ' + gzipSync(Buffer.from(script)).toString('base64') + ' | base64 -d | gzip -d | bash';

const r = spawnSync('gcloud.cmd', [
  'compute', 'ssh', 'kryptovision-server',
  '--zone=asia-south1-b',
  '--project=project-7866fc3f-5dd5-4495-804',
  '--quiet',
  '--command=' + JSON.stringify(command)
], { shell: true, encoding: 'utf8', timeout: 60000 });

console.log(r.stdout || r.stderr);
