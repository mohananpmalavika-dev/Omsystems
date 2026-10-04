import pathlib
import subprocess
import tarfile
root=pathlib.Path(__file__).resolve().parent.parent
shared=['--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--quiet']
archive=root/'scratch/helmet-head-only-update-20261004.tar.gz'
compiled=root/'analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js'
assert 'super("helmet", "1.1.4")' in compiled.read_text()
with tarfile.open(archive,'w:gz') as tar:
    tar.add(compiled,arcname='helmet-detector.js')
    tar.add(root/'analytics-engine/src/detectors/helmet-detector.ts',arcname='helmet-detector.ts')
script=root/'scratch/deploy-helmet-head-only-2026-10-04.sh'
script.write_bytes(script.read_bytes().replace(b'\r\n',b'\n'))
for local,remote in [(archive,'/tmp/helmet-head-only-update-20261004.tar.gz'),(script,'/tmp/deploy-helmet-head-only-20261004.sh')]:
    subprocess.run(['gcloud.cmd','compute','scp',str(local),'kryptovision-server:'+remote,*shared],check=True)
raise SystemExit(subprocess.run(['gcloud.cmd','compute','ssh','kryptovision-server',*shared,'--command=bash /tmp/deploy-helmet-head-only-20261004.sh']).returncode)
