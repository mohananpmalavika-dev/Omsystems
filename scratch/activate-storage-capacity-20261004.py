import subprocess
shared=['--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--quiet']
for source,target in [('dashboard/app/api/operations/storage/route.ts','/tmp/storage-capacity-route-20261004.ts'),('scratch/deploy-storage-capacity-20261004.sh','/tmp/deploy-storage-capacity-20261004.sh'),('scratch/verify-storage-summary-20261004.sh','/tmp/verify-storage-summary-20261004.sh')]:
    subprocess.run(['gcloud.cmd','compute','scp',source,'kryptovision-server:'+target,*shared],check=True)
raise SystemExit(subprocess.run(['gcloud.cmd','compute','ssh','kryptovision-server',*shared,'--command=bash /tmp/deploy-storage-capacity-20261004.sh']).returncode)
