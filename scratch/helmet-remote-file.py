import pathlib
import subprocess
import sys

source = pathlib.Path(sys.argv[1]).resolve()
remote_path = '/tmp/sentinel-fullscreen-alert-deploy-script-20261004.sh'
shared = ['--zone=asia-south1-b', '--project=project-7866fc3f-5dd5-4495-804', '--quiet']
subprocess.run(['gcloud.cmd', 'compute', 'scp', str(source), 'kryptovision-server:' + remote_path, *shared], check=True)
raise SystemExit(subprocess.run(['gcloud.cmd', 'compute', 'ssh', 'kryptovision-server', *shared, '--command=bash ' + remote_path]).returncode)
