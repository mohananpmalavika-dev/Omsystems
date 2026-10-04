import subprocess
shared=['--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--quiet']
for source,target in [('dashboard/components/recording-workspace.tsx','/tmp/recording-workspace-20261004.tsx'),('scratch/deploy-recording-playback-20261004.sh','/tmp/deploy-recording-playback-20261004.sh')]:
    subprocess.run(['gcloud.cmd','compute','scp',source,'kryptovision-server:'+target,*shared],check=True)
raise SystemExit(subprocess.run(['gcloud.cmd','compute','ssh','kryptovision-server',*shared,'--command=bash /tmp/deploy-recording-playback-20261004.sh']).returncode)
