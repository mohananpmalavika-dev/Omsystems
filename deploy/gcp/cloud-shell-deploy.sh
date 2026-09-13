#!/bin/bash
set -e

echo "========================================================"
echo "🚀 Sentinel Grid (KryptoVision) - Google Cloud 1-Click Deploy"
echo "========================================================"

ZONE="asia-south1-a"
MACHINE_TYPE="e2-standard-8"
INSTANCE_NAME="kryptovision-server"
DISK_SIZE="80GB"

# 1. Check GCP Project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" == "(unset)" ]; then
    PROJECT_ID=$(gcloud projects list --format="value(projectId)" --limit=1 2>/dev/null | tr -d '[:space:]')
    if [ -n "$PROJECT_ID" ]; then
        gcloud config set project "$PROJECT_ID"
    fi
fi
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" == "(unset)" ]; then
    PROJECT_ID="project-7866fc3f-5dd5-4495-804"
    gcloud config set project "$PROJECT_ID"
fi
echo "✅ Using Project: $PROJECT_ID"

# 2. Enable Compute Engine API
echo "Enabling Compute Engine API..."
gcloud services enable compute.googleapis.com --project="$PROJECT_ID"

# 3. Create Firewall Rules
echo "Setting up Firewall Rules..."
if ! gcloud compute firewall-rules describe allow-kryptovision --project="$PROJECT_ID" &>/dev/null; then
    gcloud compute firewall-rules create allow-kryptovision \
        --allow=tcp:80,tcp:443,tcp:8080,tcp:8090,tcp:8091,tcp:8092,tcp:8554,tcp:8888,tcp:10000,udp:8189 \
        --target-tags=kryptovision-server \
        --description="Sentinel Grid Web and Media Traffic" \
        --project="$PROJECT_ID"
fi

# 4. Download startup script
STARTUP_URL="https://raw.githubusercontent.com/mohananpmalavika-dev/Omsystems/main/deploy/gcp/startup-script.sh"
curl -sSL "$STARTUP_URL" -o /tmp/startup-script.sh

# 5. Create or Update VM Instance across available zones
CANDIDATE_ZONES=("asia-south1-b" "asia-south1-c" "asia-south1-a" "asia-south2-a" "asia-south2-b")
CANDIDATE_TYPES=("e2-standard-8" "e2-standard-4")

VM_CREATED=0
FINAL_ZONE=""

for Z in "${CANDIDATE_ZONES[@]}"; do
    if gcloud compute instances describe "$INSTANCE_NAME" --zone="$Z" --project="$PROJECT_ID" &>/dev/null; then
        echo "Found existing instance $INSTANCE_NAME in $Z. Updating startup script..."
        gcloud compute instances add-metadata "$INSTANCE_NAME" \
            --zone="$Z" \
            --metadata-from-file=startup-script=/tmp/startup-script.sh \
            --project="$PROJECT_ID"
        FINAL_ZONE="$Z"
        VM_CREATED=1
        echo "Triggering live container rebuild and restart on $INSTANCE_NAME..."
        gcloud compute ssh "$INSTANCE_NAME" --zone="$Z" --project="$PROJECT_ID" \
            --command="sudo bash -c 'cd /opt/sentinel-grid && git fetch origin main && git reset --hard origin/main && bash deploy/gcp/update-live.sh'" || true
        break
    fi
done

if [ "$VM_CREATED" -eq 0 ]; then
    for MTYPE in "${CANDIDATE_TYPES[@]}"; do
        for Z in "${CANDIDATE_ZONES[@]}"; do
            echo "Attempting to create instance with $MTYPE in zone $Z..."
            if gcloud compute instances create "$INSTANCE_NAME" \
                --zone="$Z" \
                --machine-type="$MTYPE" \
                --image-family="ubuntu-2204-lts" \
                --image-project="ubuntu-os-cloud" \
                --boot-disk-size="$DISK_SIZE" \
                --boot-disk-type="pd-balanced" \
                --tags="kryptovision-server" \
                --metadata-from-file=startup-script=/tmp/startup-script.sh \
                --project="$PROJECT_ID"; then
                echo "✅ Successfully created $INSTANCE_NAME ($MTYPE) in $Z!"
                FINAL_ZONE="$Z"
                VM_CREATED=1
                break 2
            else
                echo "Zone $Z was full for $MTYPE, trying next candidate..."
            fi
        done
    done
fi

if [ "$VM_CREATED" -eq 0 ]; then
    echo "❌ Failed to create VM in tested zones. Please check quotas."
    exit 1
fi
ZONE="$FINAL_ZONE"

# 6. Fetch External IP
EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --format="get(networkInterfaces[0].accessConfigs[0].natIP)" --project="$PROJECT_ID")

echo "========================================================"
echo "🎉 Sentinel Grid (KryptoVision) Launched on Google Cloud!"
echo "========================================================"
echo "Public IP Address: $EXTERNAL_IP"
echo "Web URL:          http://$EXTERNAL_IP"
echo "Port 10000 URL:   http://$EXTERNAL_IP:10000"
echo "Health Check:     http://$EXTERNAL_IP/health"
echo "========================================================"
echo "Containers are bootstrapping now in the VM background (~2-3 mins)."
echo "You can check VM startup progress by running:"
echo "gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command='sudo journalctl -u google-startup-scripts.service -f'"
echo "========================================================"
