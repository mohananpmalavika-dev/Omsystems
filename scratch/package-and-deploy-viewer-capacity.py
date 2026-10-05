import subprocess
import tarfile
import os

files = [
    'dashboard/components/camera-tile.tsx',
    'dashboard/lib/video/viewer-capacity-manager.ts',
]

tar_path = 'scratch/viewer-capacity-update.tar'
with tarfile.open(tar_path, 'w') as tar:
    for f in files:
        print(f"Adding {f}...")
        tar.add(f, arcname=f)

print("Tar created successfully.")

print("Copying tar to kryptovision-server...")
subprocess.run([
    'gcloud', 'compute', 'scp',
    tar_path,
    'kryptovision-server:/tmp/viewer-capacity-update.tar',
    '--zone=asia-south1-b'
], check=True)

remote_script = """
set -euo pipefail
cd /opt/sentinel-grid
backup=/tmp/viewer-capacity-backup-$(date +%s).tar
tar -cf "$backup" dashboard/components/camera-tile.tsx dashboard/lib/video/viewer-capacity-manager.ts
echo "Backup created at $backup"

sudo tar -xf /tmp/viewer-capacity-update.tar

cd deploy/gcp
echo "Building dashboard..."
sudo docker compose -f docker-compose.gcp.yml build dashboard

echo "Restarting dashboard container..."
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps dashboard

echo "Status:"
sudo docker ps --filter "name=sentinel-gcp-dashboard"
"""

print("Executing remote deployment on kryptovision-server...")
subprocess.run([
    'gcloud', 'compute', 'ssh',
    'kryptovision-server',
    '--zone=asia-south1-b',
    f'--command={remote_script}'
], check=True)

print("Deployment complete!")
