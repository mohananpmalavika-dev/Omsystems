import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const py = `
import pathlib, os, subprocess, json

root = pathlib.Path('/opt/sentinel-grid')
envpath = root / 'deploy/gcp/.env'

if not envpath.exists():
    raise RuntimeError('.env does not exist at ' + str(envpath))

# Read and backup .env
content = envpath.read_text()
backup_path = root / 'deploy/gcp/.env.bak-20261008-hd-all'
backup_path.write_text(content)

rows = content.splitlines()
new_rows = []
found = False

for row in rows:
    stripped = row.strip()
    if stripped.startswith('HELMET_HD_CAPTURE_CAMERAS=') or stripped.startswith('export HELMET_HD_CAPTURE_CAMERAS='):
        new_rows.append('HELMET_HD_CAPTURE_CAMERAS=*')
        found = True
    else:
        new_rows.append(row)

if not found:
    new_rows.append('HELMET_HD_CAPTURE_CAMERAS=*')

envpath.write_text('\\n'.join(new_rows) + '\\n')
os.chmod(envpath, 0o600)
print('Updated .env with HELMET_HD_CAPTURE_CAMERAS=*')

# Restart control-plane
cwd = root / 'deploy/gcp'
print('Recreating control-plane container...')
res = subprocess.run(
    ['docker', 'compose', '-f', 'docker-compose.gcp.yml', 'up', '-d', '--no-deps', 'control-plane'],
    cwd=cwd, capture_output=True, text=True, check=True
)
print(res.stdout)
print('Control-plane recreated successfully.')
`;

const script = 'sudo python3 -c "import base64;exec(base64.b64decode(\'' + Buffer.from(py).toString('base64') + '\'))"';
const command = 'echo ' + gzipSync(Buffer.from(script)).toString('base64') + ' | base64 -d | gzip -d | bash';

console.log('Applying HELMET_HD_CAPTURE_CAMERAS=* on kryptovision-server...');
const r = spawnSync('gcloud.cmd', [
  'compute', 'ssh', 'kryptovision-server',
  '--zone=asia-south1-b',
  '--project=project-7866fc3f-5dd5-4495-804',
  '--quiet',
  '--command=' + JSON.stringify(command)
], { shell: true, encoding: 'utf8', timeout: 120000 });

if (r.status !== 0) {
  console.error('Failed:', r.stderr || r.error?.message || r.status);
  process.exit(1);
}
console.log(r.stdout);
