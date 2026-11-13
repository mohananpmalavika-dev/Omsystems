#!/usr/bin/env bash
# ==============================================================================
# Sentinel Grid / KryptonVision - 1-Click OCI Remote Deployment (Bash)
# ==============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}  🚀 KryptonLogic / OM Systems - Oracle Cloud Remote Deployer   ${NC}"
echo -e "${CYAN}=================================================================${NC}"

read -rp "Enter your Oracle Cloud Instance Public IP: " PUBLIC_IP
if [ -z "$PUBLIC_IP" ]; then
    echo -e "${RED}Error: Public IP is required.${NC}"
    exit 1
fi

read -rp "Enter path to your SSH Private Key (.key / .pem) [~/.ssh/id_rsa]: " KEY_PATH
KEY_PATH=${KEY_PATH:-~/.ssh/id_rsa}
KEY_PATH="${KEY_PATH/#\~/$HOME}"

if [ ! -f "$KEY_PATH" ]; then
    echo -e "${RED}Error: SSH key not found at '$KEY_PATH'.${NC}"
    exit 1
fi

read -rp "Enter SSH Username [ubuntu]: " SSH_USER
SSH_USER=${SSH_USER:-ubuntu}

read -rp "Enter Custom Domain (e.g. cctv.omsystemandservice.in, or press Enter for sslip.io): " DOMAIN_NAME

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "\n${YELLOW}Uploading setup manifests to $SSH_USER@$PUBLIC_IP...${NC}"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no "$SCRIPT_DIR/setup-oci-vm.sh" "$SCRIPT_DIR/docker-compose.oci.yml" "$SCRIPT_DIR/Caddyfile" "$SSH_USER@$PUBLIC_IP:/tmp/"

echo -e "\n${CYAN}Running setup on Oracle Cloud instance (this takes ~3-5 minutes)...${NC}"
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "$SSH_USER@$PUBLIC_IP" "chmod +x /tmp/setup-oci-vm.sh && sudo /tmp/setup-oci-vm.sh '$DOMAIN_NAME'"

echo -e "\n${GREEN}=================================================================${NC}"
echo -e "${GREEN}🎉 Oracle Cloud Deployment Completed Successfully!${NC}"
echo -e "${GREEN}=================================================================${NC}"
if [ -n "$DOMAIN_NAME" ]; then
    echo -e "🌐 Live URL: https://$DOMAIN_NAME"
else
    CLEAN_IP="${PUBLIC_IP//./-}"
    echo -e "🌐 Live URL: https://$CLEAN_IP.sslip.io"
fi
echo -e "🔑 Login:    krypton / 4344@RAM"
echo -e "${GREEN}=================================================================${NC}"
