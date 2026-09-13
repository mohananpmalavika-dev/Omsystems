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
    echo "Listing your GCP projects:"
    gcloud projects list
    read -p "Enter your Google Cloud Project ID: " PROJECT_ID
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

# 5. Create or Update VM Instance
if ! gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" &>/dev/null; then
    echo "Creating High-Performance GCE Instance in Mumbai ($ZONE) - 4 vCPU / 16 GB RAM..."
    gcloud compute instances create "$INSTANCE_NAME" \
        --zone="$ZONE" \
        --machine-type="$MACHINE_TYPE" \
        --image-family="ubuntu-2204-lts" \
        --image-project="ubuntu-os-cloud" \
        --boot-disk-size="$DISK_SIZE" \
        --boot-disk-type="pd-balanced" \
        --tags="kryptovision-server" \
        --metadata-from-file=startup-script=/tmp/startup-script.sh \
        --project="$PROJECT_ID"
else
    echo "Instance $INSTANCE_NAME already exists. Updating startup script..."
    gcloud compute instances add-metadata "$INSTANCE_NAME" \
        --zone="$ZONE" \
        --metadata-from-file=startup-script=/tmp/startup-script.sh \
        --project="$PROJECT_ID"
fi

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
