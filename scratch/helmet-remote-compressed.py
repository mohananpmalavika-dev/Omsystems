import base64
import gzip
import pathlib
import subprocess
import sys

payload = base64.b64encode(gzip.compress(pathlib.Path(sys.argv[1]).read_bytes())).decode()
remote = 'printf %s ' + payload + ' | base64 -d | gzip -d | bash'
raise SystemExit(subprocess.run(['gcloud.cmd', 'compute', 'ssh', 'kryptovision-server', '--zone=asia-south1-b', '--project=project-7866fc3f-5dd5-4495-804', '--command=' + remote]).returncode)
