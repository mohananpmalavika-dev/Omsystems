import hashlib, json, os, pathlib, shutil, signal, subprocess

root = pathlib.Path('/opt/sentinel-grid')
stage = pathlib.Path('/tmp/report-management-release-20261006-v2')
manifest = json.loads((stage / 'manifest.json').read_text())
stopped = []
for entry in pathlib.Path('/proc').iterdir():
    if not entry.name.isdigit():
        continue
    try:
        args = (entry / 'cmdline').read_bytes().decode().split('\0')
        cwd = (entry / 'cwd').resolve()
        deployment = args[:2] == ['bash', '/tmp/deploy-report-management.sh']
        build = cwd == root / 'deploy/gcp' and 'docker-compose.gcp.yml' in args and args[-3:-1] == ['build', 'dashboard']
        if deployment or build:
            os.kill(int(entry.name), signal.SIGTERM)
            stopped.append(int(entry.name))
    except (OSError, UnicodeError):
        pass

restored = 0
for item in manifest['files']:
    target = (root / item['path']).resolve()
    target.relative_to(root)
    backup = stage / 'source-before' / item['path']
    current = hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
    assert current in (item['beforeSha256'], item['afterSha256']), f'Concurrent source change: {item["path"]}'
    if backup.exists():
        assert hashlib.sha256(backup.read_bytes()).hexdigest() == item['beforeSha256']
        shutil.copy2(backup, target)
    elif item['beforeSha256'] is None and target.exists():
        target.unlink()
    restored += 1

for service in ['control-plane', 'dashboard']:
    name = 'sentinel-gcp-' + service
    previous = name + ':before-management-reports-20261006'
    live = subprocess.check_output(['docker', 'inspect', name, '--format', '{{.Image}}'], text=True).strip()
    saved = subprocess.check_output(['docker', 'image', 'inspect', previous, '--format', '{{.Id}}'], text=True).strip()
    assert live == saved, f'Live image changed: {service}'
    subprocess.run(['docker', 'tag', previous, name + ':latest'], check=True)
(stage / 'stopped-by-user.txt').write_text('Stopped before activation; server source and image tags restored.\n')
print(json.dumps({'deploymentStopped': True, 'restoredSourceFiles': restored, 'liveImagesUnchanged': True, 'stoppedProcesses': stopped}))
