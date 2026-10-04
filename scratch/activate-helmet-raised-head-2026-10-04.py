import subprocess
shared=['--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--quiet']
for source,target in [('scratch/helmet-raised-head-update-20261004.tar.gz','/tmp/helmet-raised-head-update-20261004.tar.gz'),('scratch/deploy-helmet-raised-head-2026-10-04.sh','/tmp/deploy-helmet-raised-head-20261004.sh')]:
    subprocess.run(['gcloud.cmd','compute','scp',source,'kryptovision-server:'+target,*shared],check=True)
raise SystemExit(subprocess.run(['gcloud.cmd','compute','ssh','kryptovision-server',*shared,'--command=bash /tmp/deploy-helmet-raised-head-20261004.sh']).returncode)
