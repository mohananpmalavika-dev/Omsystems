import subprocess
shared=['--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--quiet']
subprocess.run(['gcloud.cmd','compute','ssh','kryptovision-server',*shared,'--command=sudo docker cp sentinel-gcp-control-plane:/tmp/helmet-new-false-alert-raw.jpg /tmp/helmet-new-false-alert-raw.jpg && sudo chmod 644 /tmp/helmet-new-false-alert-raw.jpg'],check=True)
subprocess.run(['gcloud.cmd','compute','scp','kryptovision-server:/tmp/helmet-new-false-alert-raw.jpg','scratch/helmet-new-false-alert-raw.jpg',*shared],check=True)
